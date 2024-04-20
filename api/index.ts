import type { ChainEvolvesTo, EvolutionChain, Pokemon, PokemonSpecies } from "pokedex-promise-v2";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { capitalize, isArray, startCase } from "lodash";
import { chainFormatter, pokedexGames, vowels } from "./utils";
import axios from "axios";

const pokedex = axios.create({
    baseURL: "https://pokeapi.co/api/v2",
});

const pokeErezPokedex = async (request: VercelRequest, response: VercelResponse) => {
    response.setHeader("Content-Type", "text/plain");

    const urlObject = new URL(`https://example.com${request.url}`);

    const [pokemon, form, info] = [
        urlObject.searchParams.get("pokemon"),
        urlObject.searchParams.get("form"),
        urlObject.searchParams.get("info"),
    ];

    console.log(
        `Request arguments: ${pokemon ? `pokemon: ${pokemon}, ` : ""}${
            form ? `form: ${form}, ` : ""
        }${info ? `info: ${info}` : ""}`
    );

    if (pokemon && !isArray(pokemon) && pokemon !== "null") {
        const usedForm =
            form && !isArray(form) && form !== "default" && form !== "null"
                ? form.toLowerCase()
                : null;

        try {
            const pokemonRequestStartTime = Date.now();
            const apiPokemon = await pokedex.get<Pokemon>(
                `/pokemon/${pokemon.toLowerCase()}${usedForm ? `-${usedForm}` : ""}`
            );

            console.log(
                `Pokémon request returned after ${Date.now() - pokemonRequestStartTime} ms`
            );

            const pokemonSpeciesRequestStartTime = Date.now();
            const apiPokemonSpecies = await pokedex.get<PokemonSpecies>(
                `/pokemon-species/${pokemon.toLowerCase()}`
            );

            console.log(
                `Pokémon species request returned after ${
                    Date.now() - pokemonSpeciesRequestStartTime
                } ms`
            );

            const {
                evolution_chain: evolutionChain,
                pokedex_numbers: pokedexNumbers,
                name: pokemonName,
            } = apiPokemonSpecies.data;

            const EvolutionRequestStartTime = Date.now();
            const evolutionLine = (await axios.get(evolutionChain.url)) as EvolutionChain;

            console.log(
                `Evolution chain request returned after ${
                    Date.now() - EvolutionRequestStartTime
                } ms`
            );

            const { types, abilities } = apiPokemon.data;
            const { chain: chainObject } = evolutionLine.data;

            const id = pokedexNumbers.find(
                (numberObject) => numberObject.pokedex.name === "national"
            )?.entry_number;

            const typeString = types
                .map((typeObject) => capitalize(typeObject.type.name))
                .join(" / ");

            const regularAbilities = abilities.filter((abilityObject) => !abilityObject.is_hidden);
            const hiddenAbility = abilities.find((abilityObject) => abilityObject.is_hidden);

            const isHiddenDuplicate =
                hiddenAbility &&
                regularAbilities.some(
                    (regularAbility) => regularAbility.ability.name === hiddenAbility.ability.name
                );

            if (!info || info === "generic" || info === "null") {
                response.end(
                    `${capitalize(pokemonName)}${usedForm ? `-${usedForm}` : ""} is a${
                        vowels.test(typeString) ? "n" : ""
                    } ${typeString} type Pokémon with the National Pokédex number of ${id}. It has the abilit${
                        regularAbilities.length === 1 ? "y" : "ies"
                    } ${regularAbilities
                        .map((abilityObject) => {
                            return startCase(abilityObject.ability.name);
                        })
                        .join(" and ")}${
                        hiddenAbility && !isHiddenDuplicate
                            ? ` with the hidden ability ${startCase(hiddenAbility.ability.name)}`
                            : ""
                    }.`
                );
            } else if (info === "evolution") {
                response.end(
                    `${capitalize(pokemonName)}'s evolution line includes ${chainFormatter(
                        chainObject as ChainEvolvesTo
                    )}`
                );
            } else if (info === "numbers") {
                response.end(
                    `${capitalize(pokemonName)} is ${pokedexNumbers
                        .filter((numberObject) => pokedexGames[numberObject.pokedex.name])
                        .map((numberObject) => {
                            const { entry_number: number, pokedex } = numberObject;

                            return `number ${number} in the ${pokedexGames[pokedex.name]} Pokédex`;
                        })
                        .join(", ")
                        .replace(/,([^,]*)$/, " and$1")}.`
                );
            } else {
                console.log("Invalid info argument error");
                response.end("Info can only be one of: generic, evolution, numbers");
            }
        } catch (error: any) {
            console.log("API request error:", error.message);
            response.end(
                `Couldn't find Pokémon ${capitalize(pokemon)}${
                    usedForm ? ` with form ${usedForm}` : ""
                }`
            );
        }
    } else {
        console.log("No Pokémon argument. Help message");
        response.end(`Syntax: !pokedex [pokemon] [info] [form].
        pokemon: Pokémon name or natDex number.
        info: generic/evolution/numbers.
        form: Pokémon form, use 'default' for regular/no form.`);
    }
};

export default pokeErezPokedex;
