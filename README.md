# Rock Paper Scissors

![Rock Paper Scissors](images/roshambo.png)

## What
You have to create a smart contract named RockPaperScissors, whereby:

1. Alice and Bob play the classic rock paper scissors game.
2. To enroll, each player needs to deposit the right Ether amount, possibly zero.
3. To play, each player submits their unique move.
4. The contract decides and rewards the winner with all Ether wagered.

Of course, there are many ways to implement it, so we leave to yourselves to invent.

## Stretch goals

* Make it a utility whereby any 2 people can decide to play against each other.
* Reduce gas costs as much as you can.
* Let players bet their previous winnings.
* How can you entice players to play, knowing that they may have their funding stuck in the contract if they faced an uncooperative player?

## Rules
1. The rock blunts the scissors, the scissors cut the paper, and the paper wraps the rock.
2. A game begins when the player creates it.
3. The game must be fair, so neither player should have an advantage over the other.
4. A cheater player must always lose.
5. Players must have an incentive not to cheat.

## Description
There are two players: the player and the opponent. The player chooses a move and a password; both inputs are used to generating a game ID. This identifier is used to create a game. At this stage, the player specifies the opponent, bet, and a deadline for the opponent to join the game. Next the opponent accepts the bet by joining the game and choosing his move. Then the player reveals his previous choice. To do so, the player sends his move and password in clear. The contract verifies that the hash of the entries received generates the same game ID. At this time, with the two movements revealed, the winner can be determined by the contract. The winner, if any, takes it all. In case of a tie, players recover their bet. A player who has not previously revealed his movement has automatically lost. To avoid a possible reentry attack, the contract, just before sending payments, restores the game status.

## Threat Model
This contract is secure in the sense that a player who has access to the blockchain and its contents cannot guess the movement of another player. In fact, the contract never stores the player's movement, but only the hash of the salted movement with a password that only the player knows. Since players cannot change their movement, this effectively guarantees that an opponent cannot cheat by looking at the transaction data and playing accordingly. In addition, the contract ensures that the hash function used is resistant to the preimage and the second preimage.

## Remarks
**Low Difficulty**
* If you used enums, did you remember that the first enum's underlying value is actually 0 and that all storage is initially 0 too?

**Medium Difficulty**
* Did you make sure that Bob cannot spy on Alice's move before he plays?
* Did you let one player use a fixed deadline to play right before then pretend the other one did not show up?

**High Difficulty**
* Did you let secret moves be reused?
* Did you let Alice cancel the game when she saw that Bob's pending move would make her lose?
