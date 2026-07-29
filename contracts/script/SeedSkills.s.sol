// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {SkillFactory} from "../src/SkillFactory.sol";

/// @notice Seeds the 5 initial skills from CONCEPT.md via SkillFactory.createSkill.
/// Reads the factory address from `deployments/<chainId>.json` (written by
/// Deploy.s.sol), so run Deploy first. Caller must hold CREATOR_ROLE.
contract SeedSkills is Script {
    uint256 internal constant MAX_SUPPLY = 1000;
    uint256 internal constant PRICE = 0.0005 ether;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");

        string memory json = vm.readFile(string.concat("deployments/", vm.toString(block.chainid), ".json"));
        SkillFactory factory = SkillFactory(vm.parseJsonAddress(json, ".contracts.SkillFactory"));

        vm.startBroadcast(pk);
        _create(factory, "WILD_DAUB", "wild-daub");
        _create(factory, "DOUBLE_CALL", "double-call");
        _create(factory, "GHOST_CALL", "ghost-call");
        _create(factory, "CELL_SWAP", "cell-swap");
        _create(factory, "NULLIFY", "nullify");
        vm.stopBroadcast();
    }

    /// @dev All launch skills share the same balance profile by design
    /// (1 charge/match, no cooldown, max 1 per loadout, common rarity) —
    /// power is kept flat so rarity variants sell flavor, not strength.
    function _create(SkillFactory factory, bytes32 effectType, string memory slug) internal {
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
            MAX_SUPPLY,
            PRICE
        );
        console.log(slug, skillId);
    }
}
