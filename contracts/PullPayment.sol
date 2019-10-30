pragma solidity ^0.5.0;

import './SafeMath.sol';
import "./Pausable.sol";

contract PullPayment {
    using SafeMath for uint;
    mapping(address=>uint) private payments;

    /**
     * Event emitted when the payment recorded here has been withdrawn.
     * @param toWhom The account that ran the action.
     * @param amount The value of the payment withdrawn measured in weis.
     */
    event LogPaymentWithdrawn(address indexed toWhom, uint amount);

    /**
     * Called by a child contract to pay an address by way of withdraw pattern.
     * @param whom The account that is to receive the amount.
     * @param amount The amount that is to be received.
     */
    function asyncPayTo(address whom, uint amount) internal {
        payments[whom] = payments[whom].add(amount);
    }

    /**
     * Called by a child contract to withdraw an address.
     * @param whom The account to discount the amount.
     * @param amount The amount to withdraw.
     */
    function asyncWithdrawTo(address whom, uint amount) internal {
        payments[whom] = payments[whom].sub(amount);
    }

    /**
     * Called by anyone that is owed a payment.
     *     It should roll back if the caller has 0 to withdraw.
     *     It should roll back if the recipient rejects the funds.
     *     Tests will use GreedyRecipient.sol to make sure a lot of gas is passed.
     *     Under no circumstances should it ever burn Ethers.
     * @return Whether the action was successful.
     * Emits LogPaymentWithdrawn with:
     *     The sender of the action, to which the payment is sent.
     *     The amount that was withdrawn.
     */
    function withdrawPayment() public returns(bool success) {
        uint payment = payments[msg.sender];
        require(payment != 0, "balance is zero");

        payments[msg.sender] = 0;
        emit LogPaymentWithdrawn(msg.sender, payment);
        (success,) = msg.sender.call.value(payment)("");
        require(success);
    }

    /**
     * @param whose The account that is owed a payment.
     * @return The payment owed to the address parameter.
     */
    function getPayment(address whose) view public returns(uint weis) {
        return payments[whose];
    }
}
