const truffleAssert = require('truffle-assertions');
const {eventEmitted, reverts} = truffleAssert;

const RockPaperScissors = artifacts.require("RockPaperScissors");

contract('RockPaperScissors', accounts => {
    const [OWNER, NEW_OWNER, ALICE] = accounts;
    let owned;

    beforeEach("deploy new Owned", async () => {
        owned = await RockPaperScissors.new(600, {from: OWNER});
    });

    describe("owner", function () {
        it("Initial owner", async () => {
            assert.strictEqual(await owned.getOwner(), OWNER);
        });

        it("should not be possible to change owner if not owner", async function () {
            await reverts(
                owned.setOwner(NEW_OWNER, {from: NEW_OWNER})
            );
        });

        it("Change owner", async () => {
            const result = await owned.setOwner(NEW_OWNER, {from: OWNER});
            assert.isTrue(result.receipt.status, "status must be true");
            // We expect one event
            assert.strictEqual(result.receipt.logs.length, 1);
            assert.strictEqual(result.logs.length, 1);
            // Check contract
            assert.equal(await owned.getOwner(), NEW_OWNER);
            // Check event
            await eventEmitted(result, "LogOwnerSet", log => {
                return log.previousOwner === OWNER && log.newOwner === NEW_OWNER;
            });
        });

        it("just owner can set duration parameter", async () => {
            await reverts(
                owned.setDuration4Reveal(12 * 60, {from: ALICE})
            );
        });

    });
});

