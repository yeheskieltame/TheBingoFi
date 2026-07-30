// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {SkillCollection} from "./SkillCollection.sol";

/// @title Marketplace
/// @notice Primary sale for Skill/Skin NFTs — mint on purchase, never any
/// betting/staking mechanic. Price per skillId is dynamic (see CONCEPT.md §4):
/// a scarcity premium ramps the price up as a sale approaches sold-out, and a
/// demand-decay discount grows during purchase droughts and resets on every
/// purchase. Revenue goes to the platform treasury.
contract Marketplace is AccessControl {
    /// @notice Role allowed to open new sales (held by SkillFactory).
    bytes32 public constant LISTER_ROLE = keccak256("LISTER_ROLE");

    /// @notice Basis points denominator (10000 = 100%).
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Primary sale info for one skillId.
    struct Sale {
        uint256 basePrice;
        uint256 maxSupply;
        uint256 minted;
        bool active;
        uint64 lastPurchaseAt;
    }

    /// @notice Global dynamic pricing parameters, shared by every sale.
    struct PricingParams {
        // Scarcity ramp: at minted == maxSupply the premium equals
        // basePrice * scarcityBps / BPS_DENOMINATOR (10000 = +100%).
        uint256 scarcityBps;
        // Demand decay: length of one "drought" interval with no purchase.
        uint256 decayInterval;
        // Discount added per full interval elapsed without a purchase.
        uint256 decayStepBps;
        // Upper bound on the accumulated decay discount.
        uint256 maxDiscountBps;
    }

    /// @notice ERC-1155 collection the tokens are minted from.
    SkillCollection public immutable collection;

    /// @notice Address receiving sale proceeds.
    address public treasury;

    /// @notice skillId => Sale.
    mapping(uint256 => Sale) public sales;

    /// @notice Global dynamic pricing parameters, tunable without a redeploy.
    PricingParams public pricingParams;

    error SaleExists(uint256 skillId);
    error SaleNotFound(uint256 skillId);
    error SaleInactive(uint256 skillId);
    error ZeroAmount();
    error ZeroMaxSupply();
    error SoldOut(uint256 skillId, uint256 requested, uint256 remaining);
    error InsufficientPayment(uint256 expected, uint256 actual);
    error ZeroAddress();
    error WithdrawFailed();
    error RefundFailed();
    error InvalidDecayInterval();
    error InvalidMaxDiscountBps();

    event SaleCreated(uint256 indexed skillId, uint256 basePrice, uint256 maxSupply);
    event SaleActiveSet(uint256 indexed skillId, bool active);
    event Purchased(uint256 indexed skillId, address indexed buyer, uint256 amount, uint256 paid, uint256 unitPrice);
    event TreasuryUpdated(address indexed treasury);
    event Withdrawn(address indexed treasury, uint256 amount);
    event PricingParamsUpdated(
        uint256 scarcityBps, uint256 decayInterval, uint256 decayStepBps, uint256 maxDiscountBps
    );

    constructor(address admin, SkillCollection collection_, address treasury_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        collection = collection_;
        treasury = treasury_;

        // Defaults per CONCEPT.md §4: scarcity ramps up to +100% near
        // sold-out; a full day without a purchase adds a 5% discount, capped
        // at 50%.
        uint256 scarcityBps = 10000;
        uint256 decayInterval = 1 days;
        uint256 decayStepBps = 500;
        uint256 maxDiscountBps = 5000;
        pricingParams = PricingParams({
            scarcityBps: scarcityBps,
            decayInterval: decayInterval,
            decayStepBps: decayStepBps,
            maxDiscountBps: maxDiscountBps
        });
        emit PricingParamsUpdated(scarcityBps, decayInterval, decayStepBps, maxDiscountBps);
    }

    /// @notice Open a new primary sale for a skillId. Active immediately;
    /// the decay clock starts now (no discount until a drought elapses).
    function createSale(uint256 skillId, uint256 basePrice, uint256 maxSupply) external onlyRole(LISTER_ROLE) {
        if (sales[skillId].maxSupply != 0) revert SaleExists(skillId);
        if (maxSupply == 0) revert ZeroMaxSupply();

        sales[skillId] = Sale({
            basePrice: basePrice, maxSupply: maxSupply, minted: 0, active: true, lastPurchaseAt: uint64(block.timestamp)
        });
        emit SaleCreated(skillId, basePrice, maxSupply);
    }

    /// @notice Current unit price for a skillId: base price plus scarcity
    /// premium, discounted by demand decay. Pure view, safe to call even
    /// when a sale is sold out. Reverts if no sale exists for `skillId`.
    function priceOf(uint256 skillId) public view returns (uint256) {
        Sale storage sale = sales[skillId];
        if (sale.maxSupply == 0) revert SaleNotFound(skillId);
        return _priceOf(sale);
    }

    /// @dev Assumes `sale` exists (maxSupply != 0) — callers must check first.
    function _priceOf(Sale storage sale) internal view returns (uint256) {
        PricingParams memory params = pricingParams;

        uint256 scarcityPremium = (sale.basePrice * params.scarcityBps * sale.minted) / sale.maxSupply / BPS_DENOMINATOR;
        uint256 priceBeforeDiscount = sale.basePrice + scarcityPremium;

        uint256 elapsed = block.timestamp - sale.lastPurchaseAt;
        // Intentional floor division first: discount steps only on whole
        // elapsed intervals (e.g. half an interval grants no discount yet).
        // forge-lint: disable-next-line(divide-before-multiply)
        uint256 discountBps = (elapsed / params.decayInterval) * params.decayStepBps;
        if (discountBps > params.maxDiscountBps) {
            discountBps = params.maxDiscountBps;
        }

        return (priceBeforeDiscount * (BPS_DENOMINATOR - discountBps)) / BPS_DENOMINATOR;
    }

    /// @notice Buy `amount` units of a skillId. Mints directly to the buyer.
    /// The unit price is computed once from state before the purchase, so it
    /// does not ramp up mid multi-unit buy. `msg.value` must cover the cost;
    /// any excess is refunded to the caller right after mint (CEI order).
    function buy(uint256 skillId, uint256 amount) external payable {
        Sale storage sale = sales[skillId];
        if (sale.maxSupply == 0) revert SaleNotFound(skillId);
        if (!sale.active) revert SaleInactive(skillId);
        if (amount == 0) revert ZeroAmount();

        uint256 newMinted = sale.minted + amount;
        if (newMinted > sale.maxSupply) {
            revert SoldOut(skillId, amount, sale.maxSupply - sale.minted);
        }

        uint256 unitPrice = _priceOf(sale);
        uint256 cost = unitPrice * amount;
        if (msg.value < cost) revert InsufficientPayment(cost, msg.value);

        // Checks-effects-interactions: update state before external calls.
        sale.minted = newMinted;
        sale.lastPurchaseAt = uint64(block.timestamp);

        collection.mint(msg.sender, skillId, amount);

        emit Purchased(skillId, msg.sender, amount, cost, unitPrice);

        uint256 refund = msg.value - cost;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert RefundFailed();
        }
    }

    /// @notice Enable/disable a sale (e.g. pause a drop).
    function setSaleActive(uint256 skillId, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (sales[skillId].maxSupply == 0) revert SaleNotFound(skillId);
        sales[skillId].active = active;
        emit SaleActiveSet(skillId, active);
    }

    /// @notice Update the global dynamic pricing parameters. Applies to every
    /// sale immediately (no per-sale override).
    function setPricingParams(uint256 scarcityBps, uint256 decayInterval, uint256 decayStepBps, uint256 maxDiscountBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (decayInterval == 0) revert InvalidDecayInterval();
        if (maxDiscountBps >= BPS_DENOMINATOR) revert InvalidMaxDiscountBps();

        pricingParams = PricingParams({
            scarcityBps: scarcityBps,
            decayInterval: decayInterval,
            decayStepBps: decayStepBps,
            maxDiscountBps: maxDiscountBps
        });
        emit PricingParamsUpdated(scarcityBps, decayInterval, decayStepBps, maxDiscountBps);
    }

    /// @notice Update the treasury address withdrawals are sent to.
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /// @notice Withdraw the contract's entire ETH balance to the treasury.
    /// Callable by anyone; funds can only ever flow to `treasury`.
    function withdraw() external {
        uint256 balance = address(this).balance;
        (bool ok,) = treasury.call{value: balance}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(treasury, balance);
    }
}
