pragma solidity ^0.5.0;

import "./Owned.sol";

contract Pausable is Owned {
    bool private paused;

    /**
     * Event emitted when a new paused state has been set.
     * @param sender The account that ran the action.
     * @param newPausedState The new, and current, paused state of the contract.
     */
    event LogPausedSet(address indexed sender, bool indexed newPausedState);

    constructor(bool initialPaused) public {
        paused = initialPaused;
    }

    /**
     * Sets the new paused state for this contract.
     *     It should roll back if the caller is not the current owner of this contract.
     *     It should roll back if the state passed is no different from the current.
     * @param newState The new desired "paused" state of the contract.
     * Emits LogPausedSet with:
     *     The sender of the action.
     *     The new state.
     */
    function setPaused(bool newState) public fromOwner {
        require(newState != paused);
        paused = newState;
        emit LogPausedSet(msg.sender, newState);
    }

    modifier whenPaused() {
        require(paused);
        _;
    }

    modifier whenNotPaused() {
        require(!paused);
        _;
    }

    /**
     * @return Whether the contract is indeed paused.
     */
    function isPaused() public view returns(bool isIndeed) {
        return paused;
    }
}
