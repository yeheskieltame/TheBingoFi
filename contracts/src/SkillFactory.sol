// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {SkillRegistry} from "./SkillRegistry.sol";
import {Marketplace} from "./Marketplace.sol";

/// @title SkillFactory
/// @notice Entry point tunggal platform untuk merilis skill/skin baru: satu call
/// `createSkill` mendaftarkan definisi ke Registry sekaligus membuka sale primer
/// di Marketplace. Tidak ada deploy kontrak baru per skill (modular by design).
contract SkillFactory is AccessControl {
    /// @notice Role yang diizinkan merilis skill baru (platform/creator).
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");

    /// @notice Registry katalog skill.
    SkillRegistry public immutable registry;

    /// @notice Marketplace tempat sale primer dibuka.
    Marketplace public immutable marketplace;

    event SkillCreated(uint256 indexed skillId, bytes32 indexed effectType, uint256 maxSupply, uint256 price);

    constructor(address admin, SkillRegistry registry_, Marketplace marketplace_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CREATOR_ROLE, admin);
        registry = registry_;
        marketplace = marketplace_;
    }

    /// @notice Daftarkan skill baru di Registry lalu langsung buka sale primer.
    function createSkill(SkillRegistry.SkillDef calldata def, uint256 maxSupply, uint256 price)
        external
        onlyRole(CREATOR_ROLE)
        returns (uint256 skillId)
    {
        skillId = registry.register(def);
        marketplace.createSale(skillId, price, maxSupply);
        emit SkillCreated(skillId, def.effectType, maxSupply, price);
    }
}
