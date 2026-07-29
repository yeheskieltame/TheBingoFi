// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SkillCollection
/// @notice Single ERC-1155 for all TheBingoFi Skills & Skins. tokenId == skillId
/// from SkillRegistry. Only ownership lives on-chain; gameplay effects are
/// executed by the game server.
contract SkillCollection is ERC1155, ERC2981, AccessControl {
    /// @notice Role allowed to mint tokens (held by the Marketplace).
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(string memory uri_, address admin, address royaltyReceiver) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _setDefaultRoyalty(royaltyReceiver, 500); // 5%
    }

    /// @notice Mint `amount` tokens of skillId `id` to `to`. Marketplace only (MINTER_ROLE).
    function mint(address to, uint256 id, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount, "");
    }

    /// @notice Update the metadata base URI.
    function setURI(string memory newuri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newuri);
    }

    /// @notice Update the default royalty (EIP-2981).
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
