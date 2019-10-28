pragma solidity ^0.5.0;

import "./SafeMath.sol";
import "./PullPayment.sol";

/*
 * Thus contract implements the classic game Rock, Paper, Scissors.
 *
 * Use cases.
 *
 * The player generates a game identifier based on his choice and a password.
 * Create a game. The player creates a game by submitting the game identifier, opponent, bet (can be zero),
 * and deadline for join
 * Join a game. The opponent joins the game by submitting his clear choice
 * Reveal choice. The player reveals his choice. The Winner is awarded the bet, or if a tie, the bets are returned to
 * players.
 * Cancel a game. In cases where the opponent doesn't counter the game, the player can reclaim after join deadline,
 * i.e., the opponent is penalized)
 * Claim. In cases where the player doesn't reveal his choice before reveal deadline, the opponent can reclaim his bet,
 * i.e., the player is penalized
 * Withdraw. The players can ask to transfer stakes to their wallet.
*/
contract RockPaperScissors is PullPayment {
    using SafeMath for uint;

    enum Shape {NONE, ROCK, PAPER, SCISSORS}
    enum Payoff {TIE, PLAYER, OPPONENT}

    struct Game {
        address player;
        address opponent;
        Shape playerChoice;
        Shape opponentChoice;
        uint bet;
        uint deadline4Join;
        uint deadline4Reveal;
    }

    mapping(bytes32 => Game) public games;

    uint private MAX_DURATION_FOR_REVEAL = 3600; // 1 hour in seconds
    uint private MAX_DURATION_FOR_JOIN = 86400; // 1 day in seconds

    uint private duration4Reveal;

    event LogSetDuration4Reveal(address indexed sender, uint duration4Reveal);

    event LogCreateGame(address indexed player, bytes32 indexed gameId, address indexed opponent, uint bet,
        uint deadline4Join, uint deadline4Reveal);

    event LogJoinGame(bytes32 indexed gameId, Shape opponentChoice, uint amount, uint deadline4Reveal);

    event LogRevealChoice(address indexed sender, bytes32 indexed gameId, Shape playerChoice, Payoff payoff);

    event LogCancelGame(address indexed sender, bytes32 indexed gameId);

    event LogClaim(address indexed sender, bytes32 indexed gameId);

    constructor(uint _duration4Reveal) Pausable(false) public {
        setDuration4Reveal(_duration4Reveal);
    }

    function setDuration4Reveal(uint _duration4Reveal) public fromOwner {
        require(0 < _duration4Reveal, "duration for reveal must be greater than zero");
        require(_duration4Reveal <= MAX_DURATION_FOR_REVEAL, "duration for reveal must be less than or equal that the threshold");
        duration4Reveal = _duration4Reveal;
        emit LogSetDuration4Reveal(msg.sender, duration4Reveal);
    }

    function getDuration4Reveal() view public returns (uint) {
        return duration4Reveal;
    }

    /*
     * Each game can be accessed via unique key, which is a hash derived from the inputs that game creator provided
     */
    function generateGameId(uint8 choice, bytes32 secret) view public returns(bytes32 hashedChoice) {
        hashedChoice = getHashedChoice(choice, secret);
        require(games[hashedChoice].player == address(0), "there is a previous game with same gameId");
    }

    function getHashedChoice(uint8 choice, bytes32 secret) view internal returns(bytes32 hashedChoice) {
        require(uint(Shape.NONE) < choice && choice <= uint(Shape.SCISSORS), "choice is out of bounds");
        hashedChoice = keccak256(abi.encodePacked(address(this), choice, secret));
    }

    /*
     * The player creates a game by submitting his hashed choice
     */
    function createGame(bytes32 gameId, address opponent, uint duration4Join) payable public whenNotPaused {
        require(opponent != address(0), "invalid opponent");
        require(0 < duration4Join, "duration for join must be greater than zero");
        require(duration4Join <= MAX_DURATION_FOR_JOIN, "duration for join must be less than or equal that the threshold");

        Game storage game = games[gameId];
        require(game.player == address(0), "game already exists");

        game.player = msg.sender;
        game.opponent = opponent;
        game.bet = msg.value;
        uint deadline4Join = block.timestamp.add(duration4Join);
        game.deadline4Join = deadline4Join;
        uint deadline4Reveal = deadline4Join.add(duration4Reveal);
        game.deadline4Reveal = deadline4Reveal;
        emit LogCreateGame(msg.sender, gameId, opponent, msg.value, deadline4Join, deadline4Reveal);
    }

    /*
     * The opponent joins the game providing a clear choice.
     */
    function joinGame(bytes32 gameId, uint8 choice) payable public whenNotPaused {
        require(uint(Shape.NONE) < choice && choice <= uint(Shape.SCISSORS), "choice is out of bounds");

        Game storage game = games[gameId];
        require(game.player != address(0), "game does not exist");
        address opponent = game.opponent;
        require(opponent == msg.sender, "opponent is not the one specified by the player");
        require(game.opponentChoice == Shape.NONE, "opponent is already participating in the game");
        require(block.timestamp <= game.deadline4Join, "deadline for join has expired");

        Shape opponentChoice = Shape(choice);
        game.opponentChoice = opponentChoice;
        // Adjust deadline for reveal
        uint deadline4Reveal = block.timestamp.add(duration4Reveal);
        game.deadline4Reveal = deadline4Reveal;
        // Compute opponent payment
        uint bet = game.bet;
        if (msg.value < bet) {
            uint balance = getPayment(opponent);
            uint difference = bet.sub(msg.value);
            require(difference <= balance, "not enough balance");
            asyncWithdrawTo(opponent, difference);
        }
        else if (bet < msg.value) {
            asyncPayTo(opponent, msg.value.sub(bet));
        }
        emit LogJoinGame(gameId, opponentChoice, msg.value, deadline4Reveal);
    }

    /*
     * The player reveals the hashed choice providing the clear choice and its secret.
     */
    function revealChoice(uint8 choice, bytes32 secret) public whenNotPaused {
        bytes32 gameId = getHashedChoice(choice, secret);
        Game storage game = games[gameId];
        uint deadline4Reveal = game.deadline4Reveal;
        require(0 < deadline4Reveal, "game does not exist");

        Shape opponentChoice = game.opponentChoice;
        require(opponentChoice != Shape.NONE, "opponent has not yet joined the game");

        require(game.playerChoice == Shape.NONE, "game already finished");
        require(block.timestamp <= deadline4Reveal, "deadline for reveal has expired");

        Shape playerChoice = Shape(choice);
        game.playerChoice = playerChoice;
        Payoff payoff = Payoff((3 + choice - uint(opponentChoice)) % 3);
        uint bet = game.bet;
        address player = game.player;
        address opponent = game.opponent;
        cleanAndReleaseGame(gameId);

        // Assigns bets to winner or return them in case of draw
        if (payoff == Payoff.TIE) {
            asyncPayTo(player, bet);
            asyncPayTo(opponent, bet);
        }
        else if (payoff == Payoff.PLAYER) {
            asyncPayTo(player, bet.mul(2));
        }
        else {
            asyncPayTo(opponent, bet.mul(2));
        }
        emit LogRevealChoice(msg.sender, gameId, playerChoice, payoff);
    }

    /*
     * In cases where the opponent doesn't join the game, the player can cancel the game.
     */
    function cancelGame(bytes32 gameId) public whenNotPaused {
        Game storage game = games[gameId];
        require(game.opponentChoice == Shape.NONE, "opponent is already participating in the game");
        uint deadline4Join = game.deadline4Join;
        require(deadline4Join < block.timestamp, "deadline for join has not yet expired");
        require(0 < deadline4Join, "game has not started");
        emit LogCancelGame(msg.sender, gameId);
        uint bet = game.bet;
        cleanAndReleaseGame(gameId);

        if (0 < bet) {
            asyncPayTo(game.player, bet);
        }
    }

    /*
     * In cases where the player doesn't reveal his choice, the opponent can reclaim his bet i.e., the player is penalized.
     */
    function claim(bytes32 gameId) public whenNotPaused {
        Game storage game = games[gameId];
        uint deadline4Reveal = game.deadline4Reveal;
        require(0 < deadline4Reveal, "game has not started");
        require(game.opponentChoice != Shape.NONE, "opponent has not yet joined the game");
        require(deadline4Reveal < block.timestamp, "deadline for reveal has not yet expired");
        uint bet = game.bet;
        address opponent = game.opponent;
        cleanAndReleaseGame(gameId);

        // If it is possible, penalize the player, the opponent is the winner
        if (0 < bet) {
            asyncPayTo(opponent, bet.mul(2));
        }
        emit LogClaim(msg.sender, gameId);
    }

    function cleanAndReleaseGame(bytes32 gameId) private {
        Game storage game = games[gameId];
        game.opponent = address(0);
        game.playerChoice = Shape.NONE;
        game.opponentChoice = Shape.NONE;
        game.bet = 0;
        game.deadline4Join = 0;
        game.deadline4Reveal = 0;
        // player is used to identify previous games
    }

    function() external payable {
        revert();
    }

    function kill() public fromOwner whenPaused {
        address payable owner = address(uint160(getOwner()));

        selfdestruct(owner);
    }
}
