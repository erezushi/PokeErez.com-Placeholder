import randomPokemon, { getGenerations, getTypes } from '@erezushi/pokemon-randomizer';
import { VercelRequest, VercelResponse } from '@vercel/node';
import _ from 'lodash';
import fs from 'fs';
import { romanize } from 'romans';
import PokeAPI from 'pokedex-promise-v2';

const CHOICE_FILE = './api/game/choice.json';
const LEADERBOARD_FILE = './api/game/leaderboard.json';

type Choice = {
  pokemon: string;
  guesses: string[];
};

const pokedex = new PokeAPI();

const gameApi = async (request: VercelRequest, response: VercelResponse) => {
  response.setHeader('Content-Type', 'text/plain');

  const { action, user } = request.query;

  if (!action || _.isArray(action)) {
    if (fs.existsSync(CHOICE_FILE)) {
      response.send("Game is running, try '!guesswho guess [Pokémon]'");
    } else {
      response.send("No game is running, try '!guesswho start [Gen/type]'");
    }

    return;
  }

  if (!user || _.isArray(user)) {
    response.send('Missing user parameter');

    return;
  }

  switch (action) {
    case 'start':
      if (fs.existsSync(CHOICE_FILE)) {
        response.send("Game is already running, try '!guesswho guess [Pokémon]'");

        return;
      }

      const { payload: filter } = request.query;
      if (!filter || _.isArray(filter)) {
        response.send('Please choose either a generation or a type of Pokémon to play.');

        return;
      }

      const generations = getGenerations();

      if (_.isFinite(Number(filter))) {
        if (!Object.keys(generations).includes(filter)) {
          response.send("Number given isn't an existing generation");

          return;
        }

        const pokemon = randomPokemon({ generations: [filter], amount: 1 })[0];

        fs.writeFileSync(
          CHOICE_FILE,
          JSON.stringify({ pokemon: pokemon.name, guesses: [] }, null, 2)
        );
        response.send(
          `Pokémon chosen, Typing: ${_.startCase(pokemon.type)
            .split(' ')
            .join('/')}. use '!guesswho guess [Pokémon]' to place your guesses!`
        );

        return;
      }

      const types = getTypes();

      if (Object.keys(types).includes(filter.toLowerCase())) {
        const pokemon = randomPokemon({ type: filter, amount: 1 })[0];

        fs.writeFileSync(
          CHOICE_FILE,
          JSON.stringify({ pokemon: pokemon.name, guesses: [] }, null, 2)
        );
        response.send(
          `Pokémon chosen, Gen ${romanize(
            Number(
              Object.entries(generations).find(
                ([num, genObject]) =>
                  pokemon.dexNo >= genObject.first && pokemon.dexNo <= genObject.last
              )![0]
            )
          )}. use '!guesswho guess [Pokémon]' to place your guesses!`
        );

        return;
      }

      response.send('Filter not a type or a generation number');

      break;

    case 'guess':
      if (!fs.existsSync(CHOICE_FILE)) {
        response.send("Game is not running, try '!guesswho start [Gen/type]'");

        return;
      }

      const choice = JSON.parse(fs.readFileSync(CHOICE_FILE, 'utf-8')) as Choice;

      const { payload: guess } = request.query;
      if (!guess || _.isArray(guess)) {
        response.send("You're guessing nothing? A bit pointless, no?");

        return;
      }

      if (guess.toLowerCase() === choice.pokemon.toLowerCase()) {
        const leaderboard = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf-8')) as Record<
          string,
          number
        >;
        const score = (leaderboard[user] ?? 0) + 1;
        leaderboard[user] = score;

        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2));

        fs.unlinkSync(CHOICE_FILE);
        response.send(
          `That's right! The Pokémon was ${choice.pokemon}! ${user} has guessed correctly ${score} times`
        );

        return;
      }

      if (choice.guesses.includes(guess.toLowerCase())) {
        response.send('Someone already guessed that, try something else');

        return;
      }

      choice.guesses.push(guess.toLowerCase());
      fs.writeFileSync(CHOICE_FILE, JSON.stringify(choice, null, 2));

      response.send(`Nope, it's not ${_.startCase(guess)}, continue guessing!`);

      break;

    case 'hint':
      if (!fs.existsSync(CHOICE_FILE)) {
        response.send("Game is not running, try '!guesswho start [Gen/type]'");

        return;
      }

      const chosenPokemon = JSON.parse(fs.readFileSync(CHOICE_FILE, 'utf-8')) as Choice;

      const species = await pokedex.getPokemonSpeciesByName(chosenPokemon.pokemon.toLowerCase());

      const englishDexEntries = species.flavor_text_entries.filter(
        (entry) => entry.language.name === 'en'
      );
      const randomEntry =
        englishDexEntries[Math.floor(Math.random() * englishDexEntries.length)].flavor_text;

      response.send(
        randomEntry
          .replace(new RegExp(chosenPokemon.pokemon, 'gi'), '[Pokémon]')
          .replaceAll('\n', ' ')
          .substring(0, 400)
      );

      break;

    case 'leaderboard':
      const leaderboard = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf-8')) as Record<
        string,
        number
      >;

      response.send(
        `Top guessers:\n${Object.entries(leaderboard)
          .sort((current, next) => next[1] - current[1])
          .slice(0, 5)
          .map(([user, score], index) => `#${index + 1} ${user}- ${score} guesses`)
          .join('\n')}`
      );
      break;

    case 'reset':
      fs.unlinkSync(CHOICE_FILE);
      response.send('choice.json deleted');

      break;

    default:
      break;
  }
};

export default gameApi;
