// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {BaseTest} from "./BaseTest.sol";
import {Marketplace} from "../src/Marketplace.sol";

contract MarketplaceTest is BaseTest {
    address internal lister = makeAddr("lister");

    uint256 internal constant SKILL_ID = 1;
    uint256 internal constant PRICE = 0.01 ether;
    uint256 internal constant MAX_SUPPLY = 10;

    function setUp() public override {
        super.setUp();
        bytes32 listerRole = marketplace.LISTER_ROLE();
        vm.prank(admin);
        marketplace.grantRole(listerRole, lister);
        vm.deal(buyer, 100 ether);
    }

    function test_createSale_onlyListerRole() public {
        bytes32 listerRole = marketplace.LISTER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, listerRole)
        );
        marketplace.createSale(SKILL_ID, PRICE, MAX_SUPPLY);
    }

    function test_createSale_revertsOnDuplicate() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, PRICE, MAX_SUPPLY);

        vm.prank(lister);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.SaleExists.selector, SKILL_ID));
        marketplace.createSale(SKILL_ID, PRICE, MAX_SUPPLY);
    }

    function test_createSale_revertsOnZeroMaxSupply() public {
        vm.prank(lister);
        vm.expectRevert(Marketplace.ZeroMaxSupply.selector);
        marketplace.createSale(SKILL_ID, PRICE, 0);
    }

    function test_buy_happyPath() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, PRICE, MAX_SUPPLY);

        vm.prank(buyer);
        marketplace.buy{value: PRICE * 2}(SKILL_ID, 2);

        assertEq(collection.balanceOf(buyer, SKILL_ID), 2);
        assertEq(address(marketplace).balance, PRICE * 2);
        (,, uint256 minted,) = marketplace.sales(SKILL_ID);
        assertEq(minted, 2);
    }

    function test_buy_revertsWrongPayment() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, PRICE, MAX_SUPPLY);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.WrongPayment.selector, PRICE, PRICE - 1));
        marketplace.buy{value: PRICE - 1}(SKILL_ID, 1);
    }

    function test_buy_revertsSoldOut() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, PRICE, 1);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.SoldOut.selector, SKILL_ID, 2, 1));
        marketplace.buy{value: PRICE * 2}(SKILL_ID, 2);
    }

    function test_buy_revertsSaleInactive() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, PRICE, MAX_SUPPLY);
        vm.prank(admin);
        marketplace.setSaleActive(SKILL_ID, false);

        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.SaleInactive.selector, SKILL_ID));
        marketplace.buy{value: PRICE}(SKILL_ID, 1);
    }

    function test_buy_revertsSaleNotFound() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.SaleNotFound.selector, SKILL_ID));
        marketplace.buy{value: PRICE}(SKILL_ID, 1);
    }

    function test_buy_revertsZeroAmount() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, PRICE, MAX_SUPPLY);

        vm.prank(buyer);
        vm.expectRevert(Marketplace.ZeroAmount.selector);
        marketplace.buy{value: 0}(SKILL_ID, 0);
    }

    function test_withdraw_sendsToTreasuryAndCallableByAnyone() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, PRICE, MAX_SUPPLY);
        vm.prank(buyer);
        marketplace.buy{value: PRICE}(SKILL_ID, 1);

        uint256 treasuryBefore = treasury.balance;

        vm.prank(stranger); // siapa pun boleh trigger withdraw
        marketplace.withdraw();

        assertEq(treasury.balance, treasuryBefore + PRICE);
        assertEq(address(marketplace).balance, 0);
    }

    function test_setSaleActive_onlyAdmin() public {
        vm.prank(lister);
        marketplace.createSale(SKILL_ID, PRICE, MAX_SUPPLY);

        bytes32 adminRole = marketplace.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, adminRole)
        );
        marketplace.setSaleActive(SKILL_ID, false);
    }
}
