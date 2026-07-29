// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {SkillCollection} from "../src/SkillCollection.sol";
import {Marketplace} from "../src/Marketplace.sol";
import {SkillFactory} from "../src/SkillFactory.sol";

/// @notice Deploy seluruh stack kontrak TheBingoFi (Registry, Collection, Marketplace,
/// Factory) dan wiring role-nya. Jalankan dengan `forge script` + env var PRIVATE_KEY.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);
        string memory collectionUri =
            vm.envOr("COLLECTION_URI", string("https://api.thebingofi.xyz/metadata/{id}.json"));

        vm.startBroadcast(pk);

        SkillRegistry registry = new SkillRegistry(deployer);
        SkillCollection collection = new SkillCollection(collectionUri, deployer, treasury);
        Marketplace marketplace = new Marketplace(deployer, collection, treasury);
        SkillFactory factory = new SkillFactory(deployer, registry, marketplace);

        // Wiring role: Factory jadi satu-satunya jalur register skill & buka sale;
        // Marketplace jadi satu-satunya jalur mint token.
        registry.grantRole(registry.REGISTRAR_ROLE(), address(factory));
        marketplace.grantRole(marketplace.LISTER_ROLE(), address(factory));
        collection.grantRole(collection.MINTER_ROLE(), address(marketplace));

        vm.stopBroadcast();

        console.log("Deployer:        ", deployer);
        console.log("Treasury:        ", treasury);
        console.log("SkillRegistry:   ", address(registry));
        console.log("SkillCollection: ", address(collection));
        console.log("Marketplace:     ", address(marketplace));
        console.log("SkillFactory:    ", address(factory));
    }
}
