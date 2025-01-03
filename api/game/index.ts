import _ from 'lodash';
import axios from 'axios';
import dotenv from 'dotenv';
import randomPokemon, { getGenerations, getPokemon, getTypes } from '@erezushi/pokemon-randomizer';
import { neon } from '@neondatabase/serverless';
import { PokemonSpecies } from 'pokedex-promise-v2';
import { romanize } from 'romans';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

type Choice = {
  pokemonName: string;
  guesses: string[];
};
type Score = {
  id: string;
  score: number;
};

dotenv.config();

const { DATABASE_URL, KV_REST_API_TOKEN, KV_REST_API_URL } = process.env;

const sql = neon(DATABASE_URL!);

const redis = new Redis({
  url: KV_REST_API_URL,
  token: KV_REST_API_TOKEN,
});

const answerFormat = (name: string) => name.toLowerCase().replace(/[:.']/, '').replaceAll('é', 'e');

const gameApi = async (request: VercelRequest, response: VercelResponse) => {
  response.setHeader('Content-Type', 'text/plain');

  const { action, user } = request.query;

  const choice = (await sql('SELECT * FROM "Choice"'))[0] as Choice;

  if (!action || action === 'null' || _.isArray(action)) {
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
      if (!filter || filter === 'null' || _.isArray(filter)) {
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

        await redis.set('lastAction', {
          action,
          payload: {
            chosen: filter,
            generated: _.startCase(pokemon.type),
          },
          user,
        });

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

        const generatedGen = Object.entries(generations).find(
          ([num, genObject]) => pokemon.dexNo >= genObject.first && pokemon.dexNo <= genObject.last
        )![0];

        await redis.set('lastAction', {
          action,
          payload: {
            chosen: filter,
            generated: generatedGen,
          },
          user,
        });

        response.send(
          `Pokémon chosen, Gen ${romanize(
            Number(generatedGen)
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

      if (!guess || guess === 'null' || _.isArray(guess)) {
        response.send("You're guessing nothing? A bit pointless, no?");

        return;
      }

      const formattedGuess = answerFormat(guess);

      if (formattedGuess === answerFormat(choice.pokemonName)) {
        const scoreRow = (await sql(`SELECT * FROM "Scores" WHERE id='${user}'`))[0] as Score;

        const newScore = (scoreRow?.score ?? 0) + 1;

        await sql(`INSERT INTO "Scores" (id, score)
          VALUES ('${user}', ${newScore})
          ON CONFLICT (id)
          DO UPDATE SET score = ${newScore}`);

        await sql('TRUNCATE TABLE "Choice"');

        await redis.set('lastAction', {
          action,
          payload: {
            guess,
            success: true,
          },
          user,
        });

        response.send(
          `That's right! The Pokémon was ${
            choice.pokemonName
          }! ${user} has guessed correctly ${newScore} time${newScore === 1 ? '' : 's'}`
        );

        return;
      }

      if (choice.guesses.includes(formattedGuess)) {
        response.send('Someone already guessed that, try something else');

        return;
      }

      const pokemonList = getPokemon();

      if (
        Object.values(pokemonList).some((pokemon) => {
          answerFormat(pokemon.name) === formattedGuess;
        })
      ) {
        await sql(`UPDATE "Choice" SET guesses = array_append(guesses, '${formattedGuess}')`);

        await redis.set('lastAction', {
          action,
          payload: {
            guess,
            success: false,
          },
          user,
        });

        response.send(`Nope, it's not ${_.startCase(guess)}, continue guessing!`);
      }

      response.send("Hmm.. I don't seem to recognize this Pokémon");

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
      const topScores = (await sql(
        'SELECT * FROM "Scores" ORDER BY score DESC LIMIT 5'
      )) as Score[];

      response.send(
        `Top guessers: \n${topScores
          .map(
            (scoreObj, index) =>
              `#${index + 1} ${scoreObj.id} - ${scoreObj.score} guess${
                scoreObj.score !== 1 ? 'es' : ''
              }`
          )
          .join('; \n')}`
      );
      break;

    case 'reset':
      await sql('TRUNCATE TABLE "Choice"');
      await sql(`DELETE FROM "Scores" WHERE id='PokéErez'`);

      await redis.set('lastAction', { action, payload: {}, user });

      response.send('Truncated Choice table and deleted score from Erez');

      break;

    default:
      response.send('Action not recognized');

      break;
  }
};

export default gameApi;
