// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {SkillFactory} from "../src/SkillFactory.sol";

/// @notice Seeds the 5 initial skills from CONCEPT.md via SkillFactory.createSkill.
/// Reads the factory address from `deployments/<chainId>.json` (written by
/// Deploy.s.sol), so run Deploy first. Caller must hold CREATOR_ROLE.
///
/// Supply & basePrice are intentionally staggered across skills to demo the
/// dynamic pricing scarcity tiers from CONCEPT.md §4 (Marketplace.priceOf):
/// the smaller the maxSupply, the higher the basePrice and the faster it
/// ramps toward +100% as the drop sells out — Nullify (supply 10) is the
/// "super rare" tier priced accordingly from launch.
contract SeedSkills is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        string memory json = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".json"));
        SkillFactory factory = SkillFactory(vm.parseJsonAddress(json, ".contracts.SkillFactory"));

        vm.startBroadcast(pk);
        _create(factory, "WILD_DAUB", "wild-daub", 1000, 0.0005 ether);
        _create(factory, "DOUBLE_CALL", "double-call", 500, 0.0008 ether);
        _create(factory, "GHOST_CALL", "ghost-call", 250, 0.001 ether);
        _create(factory, "CELL_SWAP", "cell-swap", 100, 0.002 ether);
        _create(factory, "NULLIFY", "nullify", 10, 0.01 ether);
        vm.stopBroadcast();
    }

    /// @dev All launch skills share the same power profile by design
    /// (1 charge/match, no cooldown, max 1 per loadout, common rarity) —
    /// power is kept flat so rarity/scarcity tiers sell flavor & prestige,
    /// not strength.
    function _create(SkillFactory factory, bytes32 effectType, string memory slug, uint256 maxSupply, uint256 basePrice)
        internal
    {
        uint256 skillId = factory.createSkill(
            SkillRegistry.SkillDef({
                skillId: 0, // assigned by the registry
                effectType: effectType,
                charges: 1,
                cooldown: 0,
                maxPerLoadout: 1,
                rarity: 1,
                active: true,
                metadataURI: string.concat("https://api.thebingofi.xyz/skills/", slug, ".json")
            }),
            maxSupply,
            basePrice
        );
        console.log(slug, skillId);
    }
}
