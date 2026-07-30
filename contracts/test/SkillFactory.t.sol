// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {BaseTest} from "./BaseTest.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";

/// @notice End-to-end: BaseTest deploys all contracts + role wiring the same way
/// script/Deploy.s.sol does. This suite exercises the full createSkill -> buy flow.
contract SkillFactoryTest is BaseTest {
    uint256 internal constant PRICE = 0.02 ether;
    uint256 internal constant MAX_SUPPLY = 5;

    function test_createSkill_onlyCreatorRole() public {
        SkillRegistry.SkillDef memory def = _sampleSkillDef("WILD_DAUB");
        bytes32 creatorRole = factory.CREATOR_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, creatorRole)
        );
        factory.createSkill(def, MAX_SUPPLY, PRICE);
    }

    function test_createSkill_registersAndListensSale() public {
        SkillRegistry.SkillDef memory def = _sampleSkillDef("WILD_DAUB");

        vm.prank(admin);
        uint256 skillId = factory.createSkill(def, MAX_SUPPLY, PRICE);

        SkillRegistry.SkillDef memory stored = registry.getSkill(skillId);
        assertEq(stored.skillId, skillId);
        assertEq(stored.effectType, bytes32("WILD_DAUB"));
        assertEq(stored.charges, def.charges);
        assertEq(stored.cooldown, def.cooldown);
        assertEq(stored.maxPerLoadout, def.maxPerLoadout);
        assertEq(stored.rarity, def.rarity);
        assertTrue(stored.active);
        assertEq(stored.metadataURI, def.metadataURI);

        (uint256 basePrice, uint256 maxSupply, uint256 minted, bool active, uint64 lastPurchaseAt) =
            marketplace.sales(skillId);
        assertEq(basePrice, PRICE);
        assertEq(maxSupply, MAX_SUPPLY);
        assertEq(minted, 0);
        assertTrue(active);
        assertEq(lastPurchaseAt, uint64(block.timestamp));
    }

    function test_endToEnd_createSkillThenBuy() public {
        SkillRegistry.SkillDef memory def = _sampleSkillDef("WILD_DAUB");

        vm.prank(admin);
        uint256 skillId = factory.createSkill(def, MAX_SUPPLY, PRICE);

        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        marketplace.buy{value: PRICE}(skillId, 1);

        assertEq(collection.balanceOf(buyer, skillId), 1);
    }
}
