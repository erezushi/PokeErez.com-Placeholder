import _ from 'lodash';
import axios from 'axios';
import dotenv from 'dotenv';
import randomPokemon, { getGenerations, getTypes } from '@erezushi/pokemon-randomizer';
import { neon } from '@neondatabase/serverless';
import { PokemonSpecies } from 'pokedex-promise-v2';
import { romanize } from 'romans';
import { VercelRequest, VercelResponse } from '@vercel/node';

dotenv.config();

const { DATABASE_URL } = process.env;

const sql = neon(DATABASE_URL!);

const gameApi = async (request: VercelRequest, response: VercelResponse) => {
  response.setHeader('Content-Type', 'text/plain');

  const { action, user } = request.query;

  const choice = (await sql('SELECT * FROM "Choice"'))[0];

  if (!action || _.isArray(action)) {
    if (choice) {
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
      if (choice) {
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

        await sql(`INSERT INTO "Choice" ("pokemonName", "guesses")
          VALUES ('${pokemon.name}', ARRAY[]::text[])`);

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

        await sql(`INSERT INTO "Choice" ("pokemonName", "guesses")
          VALUES ('${pokemon.name}', ARRAY[]::text[])`);

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
      if (!choice) {
        response.send("Game is not running, try '!guesswho start [Gen/type]'");

        return;
      }
      const { payload: guess } = request.query;

      if (!guess || _.isArray(guess)) {
        response.send("You're guessing nothing? A bit pointless, no?");

        return;
      }

      if (guess.toLowerCase() === choice.pokemonName.toLowerCase()) {
        const scoreRow = (await sql(`SELECT * FROM "Scores" WHERE id='${user}'`))[0];

        const newScore = (scoreRow?.score ?? 0) + 1;

        await sql(`INSERT INTO "Scores" (id, score)
          VALUES ('${user}', ${newScore})
          ON CONFLICT (id)
          DO UPDATE SET score = ${newScore}`);

        await sql('TRUNCATE TABLE "Choice"');

        response.send(
          `That's right! The Pokémon was ${choice.pokemonName}! ${user} has guessed correctly ${newScore} times`
        );

        return;
      }

      if (choice.guesses.includes(guess.toLowerCase())) {
        response.send('Someone already guessed that, try something else');

        return;
      }

      await sql(`UPDATE "Choice" SET guesses = array_append(guesses, '${guess.toLowerCase()}')`);

      response.send(`Nope, it's not ${_.startCase(guess)}, continue guessing!`);

      break;

    case 'hint':
      if (!choice) {
        response.send("Game is not running, try '!guesswho start [Gen/type]'");

        return;
      }

      const species = (
        await axios.get<PokemonSpecies>(
          `https://pokeapi.co/api/v2/pokemon-species/${choice.pokemonName.toLowerCase()}`
        )
      ).data;

      const englishDexEntries = species.flavor_text_entries.filter(
        (entry) => entry.language.name === 'en'
      );
      const randomEntry =
        englishDexEntries[Math.floor(Math.random() * englishDexEntries.length)].flavor_text;

      response.send(
        randomEntry
          .replace(new RegExp(choice.pokemonName, 'gi'), '[Pokémon]')
          .replaceAll('\n', ' ')
          .substring(0, 400)
      );

      break;

    case 'leaderboard':
      const topScores = await sql('SELECT * FROM "Scores" ORDER BY score DESC LIMIT 5');

      response.send(
        `Top guessers:\n${topScores
          .map(
            (scoreObj, index) =>
              `#${index + 1} ${scoreObj.id} - ${scoreObj.score} guess${
                scoreObj.score !== 1 ? 'es' : ''
              }`
          )
          .join('\n')}`
      );
      break;

    case 'reset':
      await sql('TRUNCATE TABLE "Choice"');
      response.send('choice table truncated');

      break;

    default:
      break;
  }
};

export default gameApi;
