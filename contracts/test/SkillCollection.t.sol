// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {BaseTest} from "./BaseTest.sol";

contract SkillCollectionTest is BaseTest {
    function test_mint_onlyMinterRole() public {
        bytes32 minterRole = collection.MINTER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, minterRole)
        );
        collection.mint(buyer, 1, 1);
    }

    function test_mint_asMinterMintsToken() public {
        bytes32 minterRole = collection.MINTER_ROLE();
        vm.prank(admin);
        collection.grantRole(minterRole, admin);

        vm.prank(admin);
        collection.mint(buyer, 1, 3);

        assertEq(collection.balanceOf(buyer, 1), 3);
    }

    function test_royaltyInfo_returnsFivePercentToReceiver() public view {
        (address receiver, uint256 amount) = collection.royaltyInfo(1, 1000 ether);
        assertEq(receiver, treasury);
        assertEq(amount, 50 ether); // 5% of 1000
    }

    function test_supportsInterface_erc1155AndErc2981AndAccessControl() public view {
        assertTrue(collection.supportsInterface(type(IERC1155).interfaceId));
        assertTrue(collection.supportsInterface(type(IERC2981).interfaceId));
        assertTrue(collection.supportsInterface(type(IAccessControl).interfaceId));
    }

    function test_setURI_onlyAdmin() public {
        bytes32 adminRole = collection.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole)
        );
        collection.setURI("ipfs://new/{id}.json");
    }

    function test_setURI_asAdminUpdatesUri() public {
        vm.prank(admin);
        collection.setURI("ipfs://new/{id}.json");
        assertEq(collection.uri(1), "ipfs://new/{id}.json");
    }

    function test_setDefaultRoyalty_onlyAdmin() public {
        bytes32 adminRole = collection.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole)
        );
        collection.setDefaultRoyalty(stranger, 1000);

        vm.prank(admin);
        collection.setDefaultRoyalty(stranger, 1000);
        (address receiver, uint256 amount) = collection.royaltyInfo(1, 100 ether);
        assertEq(receiver, stranger);
        assertEq(amount, 10 ether);
    }
}
