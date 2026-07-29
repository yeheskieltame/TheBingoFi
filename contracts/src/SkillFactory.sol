// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {SkillRegistry} from "./SkillRegistry.sol";
import {Marketplace} from "./Marketplace.sol";

/// @title SkillFactory
/// @notice The platform's single entry point for releasing new skills/skins: one
/// `createSkill` call registers the definition in the Registry and opens the
/// primary sale on the Marketplace. No per-skill contract deployment
/// (modular by design).
contract SkillFactory is AccessControl {
    /// @notice Role allowed to release new skills (platform/creator).
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");

    /// @notice Skill catalog registry.
    SkillRegistry public immutable registry;

    /// @notice Marketplace where primary sales are opened.
    Marketplace public immutable marketplace;

    event SkillCreated(uint256 indexed skillId, bytes32 indexed effectType, uint256 maxSupply, uint256 price);

    constructor(address admin, SkillRegistry registry_, Marketplace marketplace_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CREATOR_ROLE, admin);
        registry = registry_;
        marketplace = marketplace_;
    }

    /// @notice Register a new skill in the Registry and immediately open its primary sale.
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
