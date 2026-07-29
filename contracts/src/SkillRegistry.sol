// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SkillRegistry
/// @notice On-chain catalog of TheBingoFi Skill/Skin definitions. Stores only
/// metadata and an effect identifier (bytes32) — effect logic is executed by the
/// game server, NOT on-chain. This registry is the catalog's source of truth,
/// not a game engine.
contract SkillRegistry is AccessControl {
    /// @notice Role allowed to register new skills (typically held by SkillFactory).
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    /// @notice Definition of a single skill/skin in the catalog.
    struct SkillDef {
        uint256 skillId;
        bytes32 effectType; // off-chain identifier, e.g. "WILD_DAUB"
        uint8 charges; // uses per match
        uint8 cooldown; // turns of cooldown between uses
        uint8 maxPerLoadout; // loadout slot limit
        uint16 rarity;
        bool active; // can be disabled without deleting data
        string metadataURI;
    }

    /// @dev skillId => SkillDef. Private; access via getSkill/exists.
    mapping(uint256 => SkillDef) private _skills;

    /// @notice Next skill id to be assigned, starting from 1.
    uint256 public nextSkillId = 1;

    /// @notice No skill is registered under the given id.
    error SkillNotFound(uint256 skillId);

    event SkillRegistered(uint256 indexed skillId, bytes32 indexed effectType);
    event SkillActiveSet(uint256 indexed skillId, bool active);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Register a new skill definition under an incremental id.
    /// @dev The caller-supplied `def.skillId` is ignored and overwritten with the assigned id.
    function register(SkillDef memory def) external onlyRole(REGISTRAR_ROLE) returns (uint256 skillId) {
        skillId = nextSkillId++;
        def.skillId = skillId;
        _skills[skillId] = def;
        emit SkillRegistered(skillId, def.effectType);
    }

    /// @notice Enable/disable a skill (e.g. to nerf/disable without deleting data).
    function setActive(uint256 skillId, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!exists(skillId)) revert SkillNotFound(skillId);
        _skills[skillId].active = active;
        emit SkillActiveSet(skillId, active);
    }

    /// @notice Get the full skill definition.
    function getSkill(uint256 skillId) external view returns (SkillDef memory) {
        if (!exists(skillId)) revert SkillNotFound(skillId);
        return _skills[skillId];
    }

    /// @notice Check whether a skillId has been registered.
    function exists(uint256 skillId) public view returns (bool) {
        return _skills[skillId].skillId != 0;
    }
}
