// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SkillRegistry
/// @notice Katalog on-chain untuk definisi Skill/Skin TheBingoFi. Hanya menyimpan
/// metadata & identifier efek (bytes32) — logic efek dieksekusi di game server,
/// TIDAK on-chain. Registry ini adalah "source of truth" katalog, bukan engine game.
contract SkillRegistry is AccessControl {
    /// @notice Role yang diizinkan mendaftarkan skill baru (biasanya dipegang SkillFactory).
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    /// @notice Definisi satu skill/skin dalam katalog.
    struct SkillDef {
        uint256 skillId;
        bytes32 effectType; // identifier off-chain, mis. "WILD_DAUB"
        uint8 charges; // jumlah pakai per match
        uint8 cooldown; // giliran cooldown antar pakai
        uint8 maxPerLoadout; // batas slot loadout
        uint16 rarity;
        bool active; // bisa di-disable tanpa hapus data
        string metadataURI;
    }

    /// @dev skillId => SkillDef. Privat, akses lewat getSkill/exists.
    mapping(uint256 => SkillDef) private _skills;

    /// @notice Id skill berikutnya yang akan di-assign, mulai dari 1.
    uint256 public nextSkillId = 1;

    /// @notice Skill dengan id tersebut belum terdaftar.
    error SkillNotFound(uint256 skillId);

    event SkillRegistered(uint256 indexed skillId, bytes32 indexed effectType);
    event SkillActiveSet(uint256 indexed skillId, bool active);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Daftarkan definisi skill baru dengan id incremental.
    /// @dev `def.skillId` yang dikirim caller diabaikan & ditimpa dengan id yang di-assign.
    function register(SkillDef memory def) external onlyRole(REGISTRAR_ROLE) returns (uint256 skillId) {
        skillId = nextSkillId++;
        def.skillId = skillId;
        _skills[skillId] = def;
        emit SkillRegistered(skillId, def.effectType);
    }

    /// @notice Aktifkan/nonaktifkan skill (mis. untuk nerf/disable tanpa hapus data).
    function setActive(uint256 skillId, bool active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!exists(skillId)) revert SkillNotFound(skillId);
        _skills[skillId].active = active;
        emit SkillActiveSet(skillId, active);
    }

    /// @notice Ambil definisi skill lengkap.
    function getSkill(uint256 skillId) external view returns (SkillDef memory) {
        if (!exists(skillId)) revert SkillNotFound(skillId);
        return _skills[skillId];
    }

    /// @notice Cek apakah suatu skillId sudah terdaftar.
    function exists(uint256 skillId) public view returns (bool) {
        return _skills[skillId].skillId != 0;
    }
}
