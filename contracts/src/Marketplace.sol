// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {SkillCollection} from "./SkillCollection.sol";

/// @title Marketplace
/// @notice Primary sale untuk Skill/Skin NFT — mint on purchase, bukan mekanisme
/// betting/stake apa pun. Harga fixed per skillId, revenue masuk treasury platform.
contract Marketplace is AccessControl {
    /// @notice Role yang diizinkan membuka sale baru (dipegang SkillFactory).
    bytes32 public constant LISTER_ROLE = keccak256("LISTER_ROLE");

    /// @notice Info sale primer untuk satu skillId.
    struct Sale {
        uint256 price;
        uint256 maxSupply;
        uint256 minted;
        bool active;
    }

    /// @notice Koleksi ERC-1155 tempat token di-mint.
    SkillCollection public immutable collection;

    /// @notice Alamat penerima dana hasil penjualan.
    address public treasury;

    /// @notice skillId => Sale.
    mapping(uint256 => Sale) public sales;

    error SaleExists(uint256 skillId);
    error SaleNotFound(uint256 skillId);
    error SaleInactive(uint256 skillId);
    error ZeroAmount();
    error ZeroMaxSupply();
    error SoldOut(uint256 skillId, uint256 requested, uint256 remaining);
    error WrongPayment(uint256 expected, uint256 actual);
    error ZeroAddress();
    error WithdrawFailed();

    event SaleCreated(uint256 indexed skillId, uint256 price, uint256 maxSupply);
    event SaleActiveSet(uint256 indexed skillId, bool active);
    event Purchased(uint256 indexed skillId, address indexed buyer, uint256 amount, uint256 paid);
    event TreasuryUpdated(address indexed treasury);
    event Withdrawn(address indexed treasury, uint256 amount);

    constructor(address admin, SkillCollection collection_, address treasury_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        collection = collection_;
        treasury = treasury_;
    }

    /// @notice Buka sale primer baru untuk sebuah skillId. Langsung aktif.
    function createSale(uint256 skillId, uint256 price, uint256 maxSupply) external onlyRole(LISTER_ROLE) {
        if (sales[skillId].maxSupply != 0) revert SaleExists(skillId);
        if (maxSupply == 0) revert ZeroMaxSupply();

        sales[skillId] = Sale({price: price, maxSupply: maxSupply, minted: 0, active: true});
        emit SaleCreated(skillId, price, maxSupply);
    }

    /// @notice Beli `amount` unit skillId. Mint langsung ke pembeli.
    function buy(uint256 skillId, uint256 amount) external payable {
        Sale storage sale = sales[skillId];
        if (sale.maxSupply == 0) revert SaleNotFound(skillId);
        if (!sale.active) revert SaleInactive(skillId);
        if (amount == 0) revert ZeroAmount();

        uint256 newMinted = sale.minted + amount;
        if (newMinted > sale.maxSupply) {
            revert SoldOut(skillId, amount, sale.maxSupply - sale.minted);
        }

        uint256 expected = sale.price * amount;
        if (msg.value != expected) revert WrongPayment(expected, msg.value);

        // Checks-effects-interactions: state diupdate dulu sebelum external call mint.
        sale.minted = newMinted;

        collection.mint(msg.sender, skillId, amount);

        emit Purchased(skillId, msg.sender, amount, msg.value);
    }

    /// @notice Aktifkan/nonaktifkan sale (mis. pause drop).
    function setSaleActive(uint256 skillId, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (sales[skillId].maxSupply == 0) revert SaleNotFound(skillId);
        sales[skillId].active = active;
        emit SaleActiveSet(skillId, active);
    }

    /// @notice Ubah alamat treasury tujuan withdraw.
    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /// @notice Tarik seluruh saldo ETH kontrak ke treasury. Boleh dipanggil siapa pun,
    /// dana tetap hanya bisa mengalir ke `treasury`.
    function withdraw() external {
        uint256 balance = address(this).balance;
        (bool ok,) = treasury.call{value: balance}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(treasury, balance);
    }
}
