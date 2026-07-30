// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {BaseTest} from "./BaseTest.sol";
import {Marketplace} from "../src/Marketplace.sol";

contract MarketplaceTest is BaseTest {
    address internal lister = makeAddr("lister");

    uint256 internal constant SKILL_ID = 1;
    uint256 internal constant BASE_PRICE = 0.01 ether;
    uint256 internal constant MAX_SUPPLY = 10;

    // Default PricingParams (see Marketplace constructor / CONCEPT.md §4).
    uint256 internal constant SCARCITY_BPS = 10000;
    uint256 internal constant DECAY_INTERVAL = 1 days;
    uint256 internal constant DECAY_STEP_BPS = 500;
    uint256 internal constant MAX_DISCOUNT_BPS = 5000;
    uint256 internal constant BPS_DENOMINATOR = 10000;

    function setUp() public override {
        super.setUp();
        bytes32 listerRole = marketplace.LISTER_ROLE();
        vm.prank(admin);
        marketplace.grantRole(listerRole, lister);
        vm.deal(buyer, 1000 ether);
    }

    // ---------------------------------------------------------------------
    // createSale
    // ---------------------------------------------------------------------

    function test_createSale_onlyListerRole() public {
        bytes32 listerRole = marketplace.LISTER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, listerRole)
        );
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);
    }

    function test_createSale_revertsOnDuplicate() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        vm.prank(lister);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.SaleExists.selector, SKILL_ID));
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);
    }

    function test_createSale_revertsOnZeroMaxSupply() public {
        vm.prank(lister);
        vm.expectRevert(Marketplace.ZeroMaxSupply.selector);
        marketplace.createSale(SKILL_ID, BASE_PRICE, 0);
    }

    function test_createSale_setsLastPurchaseAtToNow() public {
        vm.warp(500_000);
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        (,,,, uint64 lastPurchaseAt) = marketplace.sales(SKILL_ID);
        assertEq(lastPurchaseAt, uint64(block.timestamp));
    }

    // ---------------------------------------------------------------------
    // priceOf — scarcity ramp
    // ---------------------------------------------------------------------

    function test_priceOf_revertsSaleNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(Marketplace.SaleNotFound.selector, SKILL_ID));
        marketplace.priceOf(SKILL_ID);
    }

    function test_priceOf_equalsBasePrice_whenFreshSale() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        // minted == 0 -> no scarcity premium; elapsed == 0 -> no discount.
        assertEq(marketplace.priceOf(SKILL_ID), BASE_PRICE);
    }

    function test_priceOf_risesWithMinted() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        // minted 0 -> 2 (20% of supply): premium = basePrice * 2 / 10 = 0.002 ether.
        vm.prank(buyer);
        marketplace.buy{value: BASE_PRICE * 2}(SKILL_ID, 2);
        assertEq(marketplace.priceOf(SKILL_ID), 0.012 ether);

        // minted 2 -> 5 (50% of supply): premium = basePrice * 5 / 10 = 0.005 ether.
        vm.prank(buyer);
        marketplace.buy{value: 0.012 ether * 3}(SKILL_ID, 3);
        assertEq(marketplace.priceOf(SKILL_ID), 0.015 ether);

        // minted 5 -> 10 (100% of supply, sold out): premium = basePrice * 10 / 10
        // = basePrice -> price doubles (+100%), matching CONCEPT.md §4.
        vm.prank(buyer);
        marketplace.buy{value: 0.015 ether * 5}(SKILL_ID, 5);
        assertEq(marketplace.priceOf(SKILL_ID), 0.02 ether);
    }

    // ---------------------------------------------------------------------
    // priceOf — demand decay
    // ---------------------------------------------------------------------

    function test_priceOf_discountGrowsAfterOneInterval() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        vm.warp(block.timestamp + DECAY_INTERVAL);
        // discountBps = 1 * 500 = 500 (5%) -> price = basePrice * 9500 / 10000.
        assertEq(marketplace.priceOf(SKILL_ID), 0.0095 ether);
    }

    function test_priceOf_discountBelowOneInterval_staysZero() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        vm.warp(block.timestamp + DECAY_INTERVAL - 1);
        assertEq(marketplace.priceOf(SKILL_ID), BASE_PRICE);
    }

    function test_priceOf_discountCappedAtMaxDiscountBps() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        // 20 intervals would be 10000bps uncapped; clamps to maxDiscountBps = 5000 (50%).
        vm.warp(block.timestamp + DECAY_INTERVAL * 20);
        assertEq(marketplace.priceOf(SKILL_ID), 0.005 ether);
    }

    function test_priceOf_discountResetsAfterPurchase() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, 0.01 ether, 100);

        vm.warp(block.timestamp + DECAY_INTERVAL * 3);
        // discountBps = 3 * 500 = 1500 (15%) -> price = 0.01 ether * 8500 / 10000.
        uint256 discountedPrice = marketplace.priceOf(SKILL_ID);
        assertEq(discountedPrice, 0.0085 ether);

        vm.prank(buyer);
        marketplace.buy{value: discountedPrice}(SKILL_ID, 1);

        // Right after purchase: elapsed == 0 -> discount resets to 0, even
        // though scarcity ticked up slightly (minted 1/100).
        uint256 priceAfter = marketplace.priceOf(SKILL_ID);
        assertEq(priceAfter, 0.0101 ether);
    }

    function test_priceOf_scarcityAndDecayCombined() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        // minted -> 5/10 => scarcity premium = 0.005 ether, price = 0.015 ether.
        vm.prank(buyer);
        marketplace.buy{value: BASE_PRICE * 5}(SKILL_ID, 5);
        assertEq(marketplace.priceOf(SKILL_ID), 0.015 ether);

        // Let 2 intervals pass with no purchase -> discountBps = 1000 (10%).
        vm.warp(block.timestamp + DECAY_INTERVAL * 2);
        // price = 0.015 ether * 9000 / 10000 = 0.0135 ether.
        assertEq(marketplace.priceOf(SKILL_ID), 0.0135 ether);
    }

    // ---------------------------------------------------------------------
    // buy
    // ---------------------------------------------------------------------

    function test_buy_happyPath_exactPayment() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        vm.expectEmit(true, true, false, true);
        emit Marketplace.Purchased(SKILL_ID, buyer, 2, BASE_PRICE * 2, BASE_PRICE);

        vm.prank(buyer);
        marketplace.buy{value: BASE_PRICE * 2}(SKILL_ID, 2);

        assertEq(collection.balanceOf(buyer, SKILL_ID), 2);
        assertEq(address(marketplace).balance, BASE_PRICE * 2);
        (,, uint256 minted,, uint64 lastPurchaseAt) = marketplace.sales(SKILL_ID);
        assertEq(minted, 2);
        assertEq(lastPurchaseAt, uint64(block.timestamp));
    }

    function test_buy_overpay_refundsExcessAfterMint() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        uint256 cost = BASE_PRICE * 2;
        uint256 overpay = 0.5 ether;
        uint256 buyerBalanceBefore = buyer.balance;

        vm.prank(buyer);
        marketplace.buy{value: cost + overpay}(SKILL_ID, 2);

        assertEq(collection.balanceOf(buyer, SKILL_ID), 2);
        // Contract keeps exactly the cost; buyer only ever loses `cost`.
        assertEq(address(marketplace).balance, cost);
        assertEq(buyer.balance, buyerBalanceBefore - cost);
    }

    function test_buy_revertsInsufficientPayment() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.InsufficientPayment.selector, BASE_PRICE, BASE_PRICE - 1));
        marketplace.buy{value: BASE_PRICE - 1}(SKILL_ID, 1);
    }

    function test_buy_revertsSoldOut() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, 1);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.SoldOut.selector, SKILL_ID, 2, 1));
        marketplace.buy{value: BASE_PRICE * 2}(SKILL_ID, 2);
    }

    function test_buy_revertsSaleInactive() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);
        vm.prank(admin);
        marketplace.setSaleActive(SKILL_ID, false);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.SaleInactive.selector, SKILL_ID));
        marketplace.buy{value: BASE_PRICE}(SKILL_ID, 1);
    }

    function test_buy_revertsSaleNotFound() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.SaleNotFound.selector, SKILL_ID));
        marketplace.buy{value: BASE_PRICE}(SKILL_ID, 1);
    }

    function test_buy_revertsZeroAmount() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        vm.prank(buyer);
        vm.expectRevert(Marketplace.ZeroAmount.selector);
        marketplace.buy{value: 0}(SKILL_ID, 0);
    }

    function test_buy_refundFailure_revertsRefundFailed() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        NoReceiveBuyer badBuyer = new NoReceiveBuyer(marketplace);
        vm.deal(address(badBuyer), 1 ether);

        vm.expectRevert(Marketplace.RefundFailed.selector);
        badBuyer.buy{value: BASE_PRICE + 1}(SKILL_ID, 1);
    }

    function test_buy_superRareSupplyOne_soldOutButPriceOfStillQueryable() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, 1 ether, 1);

        vm.prank(buyer);
        marketplace.buy{value: 1 ether}(SKILL_ID, 1);

        assertEq(collection.balanceOf(buyer, SKILL_ID), 1);

        // priceOf still works after sold out (fully scarcity-ramped: +100%).
        assertEq(marketplace.priceOf(SKILL_ID), 2 ether);

        // But buying more reverts SoldOut.
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.SoldOut.selector, SKILL_ID, 1, 0));
        marketplace.buy{value: 2 ether}(SKILL_ID, 1);
    }

    // ---------------------------------------------------------------------
    // setPricingParams
    // ---------------------------------------------------------------------

    function test_defaultPricingParams() public view {
        (uint256 scarcityBps, uint256 decayInterval, uint256 decayStepBps, uint256 maxDiscountBps) =
            marketplace.pricingParams();
        assertEq(scarcityBps, SCARCITY_BPS);
        assertEq(decayInterval, DECAY_INTERVAL);
        assertEq(decayStepBps, DECAY_STEP_BPS);
        assertEq(maxDiscountBps, MAX_DISCOUNT_BPS);
    }

    function test_setPricingParams_onlyAdmin() public {
        bytes32 adminRole = marketplace.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole)
        );
        marketplace.setPricingParams(0, 1 days, 0, 0);
    }

    function test_setPricingParams_revertsZeroDecayInterval() public {
        vm.prank(admin);
        vm.expectRevert(Marketplace.InvalidDecayInterval.selector);
        marketplace.setPricingParams(SCARCITY_BPS, 0, DECAY_STEP_BPS, MAX_DISCOUNT_BPS);
    }

    function test_setPricingParams_revertsMaxDiscountBpsAtOrAboveDenominator() public {
        vm.prank(admin);
        vm.expectRevert(Marketplace.InvalidMaxDiscountBps.selector);
        marketplace.setPricingParams(SCARCITY_BPS, DECAY_INTERVAL, DECAY_STEP_BPS, BPS_DENOMINATOR);
    }

    function test_setPricingParams_updatesStateAndEmits() public {
        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit Marketplace.PricingParamsUpdated(0, 2 days, 0, 0);
        marketplace.setPricingParams(0, 2 days, 0, 0);

        (uint256 scarcityBps, uint256 decayInterval, uint256 decayStepBps, uint256 maxDiscountBps) =
            marketplace.pricingParams();
        assertEq(scarcityBps, 0);
        assertEq(decayInterval, 2 days);
        assertEq(decayStepBps, 0);
        assertEq(maxDiscountBps, 0);
    }

    function test_setPricingParams_affectsPriceOf() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        // Disable scarcity & decay entirely -> price always equals basePrice.
        vm.prank(admin);
        marketplace.setPricingParams(0, 1 days, 0, 0);

        vm.prank(buyer);
        marketplace.buy{value: BASE_PRICE * 9}(SKILL_ID, 9);

        vm.warp(block.timestamp + 30 days);
        assertEq(marketplace.priceOf(SKILL_ID), BASE_PRICE);
    }

    // ---------------------------------------------------------------------
    // setSaleActive / setTreasury / withdraw (unchanged behaviour)
    // ---------------------------------------------------------------------

    function test_withdraw_sendsToTreasuryAndCallableByAnyone() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);
        vm.prank(buyer);
        marketplace.buy{value: BASE_PRICE}(SKILL_ID, 1);

        uint256 treasuryBefore = treasury.balance;

        vm.prank(stranger); // anyone may trigger withdraw
        marketplace.withdraw();

        assertEq(treasury.balance, treasuryBefore + BASE_PRICE);
        assertEq(address(marketplace).balance, 0);
    }

    function test_withdraw_revertsWhenTreasuryRejectsEth() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);
        vm.prank(buyer);
        marketplace.buy{value: BASE_PRICE}(SKILL_ID, 1);

        // A contract without receive/fallback rejects the ETH transfer.
        address rejecting = address(new RejectsEth());
        vm.prank(admin);
        marketplace.setTreasury(rejecting);

        vm.expectRevert(Marketplace.WithdrawFailed.selector);
        marketplace.withdraw();
    }

    function test_setTreasury_updatesAndEmits() public {
        address newTreasury = makeAddr("newTreasury");

        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit Marketplace.TreasuryUpdated(newTreasury);
        marketplace.setTreasury(newTreasury);

        assertEq(marketplace.treasury(), newTreasury);
    }

    function test_setTreasury_onlyAdmin() public {
        bytes32 adminRole = marketplace.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole)
        );
        marketplace.setTreasury(stranger);
    }

    function test_setTreasury_revertsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(Marketplace.ZeroAddress.selector);
        marketplace.setTreasury(address(0));
    }

    function test_setSaleActive_revertsSaleNotFound() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.SaleNotFound.selector, SKILL_ID));
        marketplace.setSaleActive(SKILL_ID, false);
    }

    function test_setSaleActive_onlyAdmin() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, BASE_PRICE, MAX_SUPPLY);

        bytes32 adminRole = marketplace.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole)
        );
        marketplace.setSaleActive(SKILL_ID, false);
    }
}

/// @dev Has no receive/fallback, so any plain ETH transfer to it fails.
contract RejectsEth {}

/// @dev Buys through the Marketplace on behalf of a caller. Implements
/// onERC1155Received so the mint itself succeeds, but has no receive/fallback
/// — so it can never accept the overpayment refund. Used to exercise the
/// RefundFailed revert path.
contract NoReceiveBuyer {
    Marketplace internal immutable marketplace;

    constructor(Marketplace marketplace_) {
        marketplace = marketplace_;
    }

    function buy(uint256 skillId, uint256 amount) external payable {
        marketplace.buy{value: msg.value}(skillId, amount);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }
}
