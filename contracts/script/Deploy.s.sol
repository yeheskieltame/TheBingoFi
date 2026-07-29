// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {SkillCollection} from "../src/SkillCollection.sol";
import {Marketplace} from "../src/Marketplace.sol";
import {SkillFactory} from "../src/SkillFactory.sol";

/// @notice Deploys the full TheBingoFi contract stack (Registry, Collection,
/// Marketplace, Factory) and wires up roles. Run with `forge script` + the
/// PRIVATE_KEY env var.
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

        // Role wiring: the Factory is the only path to register skills & open sales;
        // the Marketplace is the only path to mint tokens.
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

        _writeDeploymentJson(registry, collection, marketplace, factory, treasury);
    }

    /// @notice Writes the deployed addresses to `deployments/<chainId>.json` so
    /// FE/server can read this file instead of hardcoding addresses.
    /// Not part of the deploy logic — purely an artifact for off-chain consumers.
    function _writeDeploymentJson(
        SkillRegistry registry,
        SkillCollection collection,
        Marketplace marketplace,
        SkillFactory factory,
        address treasury
    ) internal {
        string memory contractsKey = "contracts";
        vm.serializeAddress(contractsKey, "SkillRegistry", address(registry));
        vm.serializeAddress(contractsKey, "SkillFactory", address(factory));
        vm.serializeAddress(contractsKey, "SkillCollection", address(collection));
        string memory contractsJson = vm.serializeAddress(contractsKey, "Marketplace", address(marketplace));

        string memory rootKey = "root";
        vm.serializeUint(rootKey, "chainId", block.chainid);
        vm.serializeString(rootKey, "contracts", contractsJson);
        vm.serializeAddress(rootKey, "treasury", treasury);
        string memory finalJson = vm.serializeUint(rootKey, "timestamp", block.timestamp);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(finalJson, path);
        console.log("Deployments JSON:", path);
    }
}
