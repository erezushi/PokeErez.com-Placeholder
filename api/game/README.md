# Pokémon Guess Who

### Stream chatbot game by [PokéErez](https://linktr.ee/erezushi)

An API endpoint for playing a game of Guess Who, using query parameters, and text responses for chatbot support.

The API is available on https://pokeerez.com/api/game

All requests to the API must include the query parameters `action` _(what you want to do)_ and `user` _(YouTube/Twitch username of the sender)_. Some actions also require a `payload` parameter.

## Setup for Your Own Chatbot

If you want to play this on your own stream, you'd have to set yourself as a game manager an obtain a game key, which can be done by sending a GET request _(through a browser, Postman, or any other means)_ to the above address with `action` set to `key`, and `user` set to your own username.

**Example**

```
https://pokeerez.com/api/game?action=key&user=PokéErez
```

The API will respond confirming the user has been set as manager and return the game key, which consists of 21 Upper- & lower-case letters, numbers, dashes and underscores.

**Pay attention**: The key will only appear once, so make sure to save it somewhere you'll be able to retrieve it from later. Sending the same request a second time will be responded with `Username already registered`.

All actions other than `key` must also include the `key` query parameter, set to the game key you've obtained in the previous step.

## Playing the Game

[For a summary](#action-summary)

To start a game, use the `start` action. Set `payload` to either a Pokémon type, or a generation number. The API will generate a random Pokémon matching the given filter, and will supply the other bit of information.

You can request hints in the form of a random Pokédex entry of the chosen Pokémon _(with its name replaced with `[Pokémon]` if it appears)_. To do so, use the `hint` action.

To guess a Pokémon, use the `guess` action, with the guess going into `payload`. The guess is case-insensitive, and accepts, but does not require, any accents or punctuation that Pokémon names contain, but for chatbot support, spaces must be replaced with dashes _(`Mr.-Mime` is accepted the same as `mR-mImE`)_.

On a successful guess, the game will award the guesser _(`user`)_ with a point for your game key, and reset the game.

A wrong guess will just receive a corresponding response. The game tracks which Pokémon have been guessed in each game _(but not who made each guess)_, so a duplicate guess will be recognized.

Two more actions are available in the API, even when a game is not running. `leaderboard` can be used to retrieve the top five guessers for your game key, and `reset`, which can only be used by the game manager, will end a game prematurely, and if `payload` is set to `true`, delete the manager's score from their game key as well.

## Action Summary

[For details](#playing-the-game)

|   Action    |    Description     |               Payload               |  Can be Used   |              Notes               |
| :---------: | :----------------: | :---------------------------------: | :------------: | :------------------------------: |
|    start    |    Start a game    | Filter (Pokémon type or generation) |    Off-game    |                -                 |
|    guess    |  Guess a Pokémon   |           Guessed Pokémon           |    On-game     |                -                 |
|    hint     |   Request a hint   |                  -                  |    On-game     |                -                 |
| leaderboard | Get top 5 guessers |                  -                  | On- & off-game |                -                 |
|    reset    |     End a game     |  `true` for deleting manager score  | On- & off-game | Can only be used by game manager |

## Chatbot integration

To make the game playable with your chatbot, you need to make a `!guesswho` command that calls the API and sends the needed query parameters.

Here area a few examples of the command in popular chatbots _(replace [game key] with your game key)_:

**Nightbot**

```
$(urlfetch https://pokeerez.com/api/game?action=$(1)&payload=$(2)&user=$(user)&key=[game key])
```

**Cloudbot (StreamLabs)**

```
{readapi.https://pokeerez.com/api/game?action={1}&payload={2}&user={user.name}&key=[game key]}
```

**StreamElements**

```
$(customapi https://pokeerez.com/api/game?action=$(1)&payload=$(2)&user=$(user)&key=[game key])
```

**Moobot**

```
<<URL Fetch>>

URL to fetch: https://pokeerez.com/api/game?action=<<Command Argument 1>>&payload=<<Command Argument 2>>&user=<<Username>>&key=[game key]

URL response type: plain text

Request method: GET
```

**Fossabot**

```
$(customapi https://pokeerez.com/api/game?action=$(index1 null)&payload=$(index2 null)&user=$(user)&key=[game key])
```

**DeepBot**

```
@customapi@[https://pokeerez.com/api/game?action=@target@[1]&payload=@target@[2]&user=@user@&key=[game key]]
```
