// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {SkillCollection} from "../src/SkillCollection.sol";
import {Marketplace} from "../src/Marketplace.sol";
import {SkillFactory} from "../src/SkillFactory.sol";

/// @notice Shared base test: deploys the full stack + role wiring, used by all
/// test suites to avoid duplicating setup.
abstract contract BaseTest is Test {
    address internal admin = makeAddr("admin");
    address internal treasury = makeAddr("treasury");
    address internal buyer = makeAddr("buyer");
    address internal stranger = makeAddr("stranger");

    SkillRegistry internal registry;
    SkillCollection internal collection;
    Marketplace internal marketplace;
    SkillFactory internal factory;

    function setUp() public virtual {
        vm.startPrank(admin);
        registry = new SkillRegistry(admin);
        collection = new SkillCollection("https://api.thebingofi.xyz/metadata/{id}.json", admin, treasury);
        marketplace = new Marketplace(admin, collection, treasury);
        factory = new SkillFactory(admin, registry, marketplace);

        registry.grantRole(registry.REGISTRAR_ROLE(), address(factory));
        marketplace.grantRole(marketplace.LISTER_ROLE(), address(factory));
        collection.grantRole(collection.MINTER_ROLE(), address(marketplace));
        vm.stopPrank();
    }

    /// @dev Helper bikin SkillDef contoh (skillId diabaikan oleh registry.register).
    function _sampleSkillDef(bytes32 effectType) internal pure returns (SkillRegistry.SkillDef memory) {
        return SkillRegistry.SkillDef({
            skillId: 0,
            effectType: effectType,
            charges: 1,
            cooldown: 0,
            maxPerLoadout: 2,
            rarity: 1,
            active: true,
            metadataURI: "ipfs://sample"
        });
    }
}
