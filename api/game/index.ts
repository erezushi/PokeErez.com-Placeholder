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
  key: string;
  pokemonName: string;
  guesses: string[];
};
type Score = {
  'key-id': string;
  key: string;
  id: string;
  score: number;
};
type Manager = {
  key: string;
  manager: string;
};

dotenv.config();

const { DATABASE_URL, KV_REST_API_TOKEN, KV_REST_API_URL } = process.env;

const sql = neon(DATABASE_URL!);

const redis = new Redis({
  url: KV_REST_API_URL,
  token: KV_REST_API_TOKEN,
});

const answerReplacements = new Map<string | RegExp, string>([
  [' ', '-'],
  [/[:.']/g, ''],
  ['é', 'e'],
  ['♀', '-f'],
  ['♂', '-m'],
]);

const answerFormat = (name: string) => {
  let nameCopy = name.toLowerCase();

  answerReplacements.forEach((value, key) => {
    nameCopy.replace(key, value);
  });

  return nameCopy;
};

const gameApi = async (request: VercelRequest, response: VercelResponse) => {
  response.setHeader('Content-Type', 'text/plain');

  const { action, user, key } = request.query;

  if (!key || key === 'null' || _.isArray(key)) {
    if (action === 'key') {
      const existingManager = (
        await sql(`SELECT * FROM "Managers" WHERE manager='${user}'`)
      )[0] as Manager;

      if (existingManager) {
        response.send('Username already registered');

        return;
      }

      const { nanoid } = await import('nanoid');

      const newKey = nanoid();

      await sql(`INSERT INTO "Managers" ("key", "manager")
        VALUES ('${newKey}', '${user}')`);

      response.send(
        `${user} registered as a game manager. Game key is ${newKey}\nKeep it somewhere safe, it will not be shown to you again.`
      );
    } else {
      response.send(
        'Missing game key. Need to make one? head over to https://github.com/erezushi/PokeErez.com-Placeholder/tree/main/api/game and follow the instructions'
      );
    }

    return;
  }

  const managerRecord = (await sql(`SELECT * FROM "Managers" WHERE key='${key}'`))[0] as Manager;

  if (!managerRecord) {
    response.send(
      'Game key not recognized. Need to make one? head over to https://github.com/erezushi/PokeErez.com-Placeholder/tree/main/api/game and follow the instructions'
    );

    return;
  }

  const choice = (await sql(`SELECT * FROM "Choice" WHERE key='${key}'`))[0] as Choice;

  if (!action || action === 'null' || _.isArray(action)) {
    if (choice) {
      response.send("Game is running, try '!guesswho guess [Pokémon]'");
    } else {
      response.send("No game is running, try '!guesswho start [Gen/type]'");
    }

    return;
  }

  if (!user || user === 'null' || _.isArray(user)) {
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

        await sql(`INSERT INTO "Choice" ("key", "pokemonName", "guesses")
          VALUES ('${key}', '${pokemon.name}', ARRAY[]::text[])`);

        await redis.set(key, {
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

        await sql(`INSERT INTO "Choice" ("key", "pokemonName", "guesses")
          VALUES ('${key}', '${pokemon.name}', ARRAY[]::text[])`);

        const generatedGen = Object.entries(generations).find(
          ([num, genObject]) => pokemon.dexNo >= genObject.first && pokemon.dexNo <= genObject.last
        )![0];

        await redis.set(key, {
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
        const scoreRow = (
          await sql(`SELECT * FROM "Scores" WHERE id='${user}' AND key='${key}'`)
        )[0] as Score;

        const newScore = (scoreRow?.score ?? 0) + 1;

        await sql(`INSERT INTO "Scores" ("key-id", key, id, score)
          VALUES ('${key}-${user}', '${key}', '${user}', ${newScore})
          ON CONFLICT ("key-id")
          DO UPDATE SET score = ${newScore}`);

        await sql(`DELETE FROM "Choice" WHERE key='${key}'`);

        await redis.set(key, {
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
        Object.values(pokemonList).some((pokemon) => answerFormat(pokemon.name) === formattedGuess)
      ) {
        await sql(
          `UPDATE "Choice" SET guesses = array_append(guesses, '${formattedGuess}') WHERE key='${key}'`
        );

        await redis.set(key, {
          action,
          payload: {
            guess,
            success: false,
          },
          user,
        });

        response.send(`Nope, it's not ${_.startCase(guess)}, continue guessing!`);

        return;
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
          `https://pokeapi.co/api/v2/pokemon-species/${answerFormat(choice.pokemonName)}`
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
        `SELECT * FROM "Scores" WHERE key='${key}' ORDER BY score DESC LIMIT 5`
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
      if (user !== managerRecord.manager) {
        response.send('Only the game manager can reset the game');

        return;
      }

      await sql(`DELETE FROM "Choice" WHERE key='${key}'`);
      let responseText = `Reset ${user}'s game`;

      const { payload: deleteUserScore } = request.query;

      if (deleteUserScore === 'true') {
        await sql(`DELETE FROM "Scores" WHERE id='${user}' AND key='${key}'`);
        responseText += ` and deleted their score from it`;
      }

      await redis.set(key, {
        action,
        payload: {
          deleteUserScore,
        },
        user,
      });

      response.send(responseText);

      break;

    default:
      response.send('Action not recognized');

      break;
  }
};

export default gameApi;
