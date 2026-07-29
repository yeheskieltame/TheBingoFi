// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {BaseTest} from "./BaseTest.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";

contract SkillRegistryTest is BaseTest {
    address internal registrar = makeAddr("registrar");

    function setUp() public override {
        super.setUp();
        bytes32 registrarRole = registry.REGISTRAR_ROLE();
        vm.prank(admin);
        registry.grantRole(registrarRole, registrar);
    }

    function test_register_revertsWithoutRegistrarRole() public {
        SkillRegistry.SkillDef memory def = _sampleSkillDef("WILD_DAUB");
        bytes32 registrarRole = registry.REGISTRAR_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, registrarRole)
        );
        registry.register(def);
    }

    function test_register_incrementalIdStartingAtOne() public {
        SkillRegistry.SkillDef memory def = _sampleSkillDef("WILD_DAUB");

        vm.prank(registrar);
        uint256 firstId = registry.register(def);
        assertEq(firstId, 1);

        vm.prank(registrar);
        uint256 secondId = registry.register(def);
        assertEq(secondId, 2);

        assertEq(registry.nextSkillId(), 3);
    }

    function test_register_storesDataCorrectlyAndOverridesSkillId() public {
        SkillRegistry.SkillDef memory def = SkillRegistry.SkillDef({
            skillId: 999, // harus ditimpa oleh registry
            effectType: "DOUBLE_CALL",
            charges: 1,
            cooldown: 2,
            maxPerLoadout: 2,
            rarity: 3,
            active: true,
            metadataURI: "ipfs://double-call"
        });

        vm.prank(registrar);
        uint256 skillId = registry.register(def);

        SkillRegistry.SkillDef memory stored = registry.getSkill(skillId);
        assertEq(stored.skillId, skillId);
        assertNotEq(stored.skillId, 999);
        assertEq(stored.effectType, bytes32("DOUBLE_CALL"));
        assertEq(stored.charges, 1);
        assertEq(stored.cooldown, 2);
        assertEq(stored.maxPerLoadout, 2);
        assertEq(stored.rarity, 3);
        assertTrue(stored.active);
        assertEq(stored.metadataURI, "ipfs://double-call");
    }

    function test_register_emitsEvent() public {
        SkillRegistry.SkillDef memory def = _sampleSkillDef("GHOST_CALL");
        vm.expectEmit(true, true, false, false, address(registry));
        emit SkillRegistry.SkillRegistered(1, "GHOST_CALL");
        vm.prank(registrar);
        registry.register(def);
    }

    function test_setActive_onlyAdmin() public {
        vm.prank(registrar);
        uint256 skillId = registry.register(_sampleSkillDef("WILD_DAUB"));

        bytes32 adminRole = registry.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole)
        );
        registry.setActive(skillId, false);

        vm.prank(admin);
        registry.setActive(skillId, false);
        SkillRegistry.SkillDef memory stored = registry.getSkill(skillId);
        assertFalse(stored.active);
    }

    function test_setActive_revertsSkillNotFound() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.SkillNotFound.selector, 42));
        registry.setActive(42, true);
    }

    function test_getSkill_revertsSkillNotFound() public {
        vm.expectRevert(abi.encodeWithSelector(SkillRegistry.SkillNotFound.selector, 7));
        registry.getSkill(7);
    }

    function test_exists() public {
        assertFalse(registry.exists(1));
        vm.prank(registrar);
        registry.register(_sampleSkillDef("WILD_DAUB"));
        assertTrue(registry.exists(1));
    }
}
