// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SkillCollection
/// @notice Satu ERC-1155 untuk seluruh Skill & Skin TheBingoFi. tokenId == skillId
/// dari SkillRegistry. Ownership on-chain saja; efek gameplay dieksekusi di server.
contract SkillCollection is ERC1155, ERC2981, AccessControl {
    /// @notice Role yang diizinkan mint token (dipegang Marketplace).
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(string memory uri_, address admin, address royaltyReceiver) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _setDefaultRoyalty(royaltyReceiver, 500); // 5%
    }

    /// @notice Mint `amount` token skillId `id` ke `to`. Hanya Marketplace (MINTER_ROLE).
    function mint(address to, uint256 id, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount, "");
    }

    /// @notice Ubah base URI metadata.
    function setURI(string memory newuri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newuri);
    }

    /// @notice Ubah royalti default (EIP-2981).
    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    /// @inheritdoc ERC1155
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC2981, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
