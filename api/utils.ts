import {startCase} from "lodash";
import {ChainEvolvesTo, PurpleEvolutionDetail} from "pokedex-promise-v2";

export const vowels = /^[AEIOUaeiou]/;

const detailsParser = (detailsObject: PurpleEvolutionDetail) => {
    let text: string;

    switch (detailsObject.trigger.name) {
    case "level-up":
        text = "levelling up";
        break;

    case "trade":
        text = "trading";
        break;

    case "use-item":
        text = `using a${
            detailsObject.item?.name.match(vowels) ? "n" : ""
        } ${startCase(
            detailsObject.item?.name
        )}`;
        break;

    case "shed":
        text = "shedding";
        break;

    case "spin":
        text = "spinning in place";
        break;

    case "tower-of-darkness":
        text = "finishing the Tower of Darkness";
        break;

    case "tower-of-waters":
        text = "finishing the Tower of Waters";
        break;

    case "three-critical-hits":
        text = "landing three crits in one battle";
        break;

    case "take-damage":
        text = "taking some damage then visiting a special location";
        break;

    case "agile-style-move":
        text = "using a certain amount of Agile Style";
        break;

    case "strong-style-move":
        text = "using a certain amount of Strong Style";
        break;

    case "recoil-damage":
        text = "taking some recoil damage";
        break;

    case "other":
        text = "levelling up under certain conditions";
        break;

    default:
        text = "unknown method";
        break;
    }

    Object.entries(detailsObject)
        .filter(
            ([key, value]) =>
                !(key === "trigger" || key === "item") &&
        (Boolean(value) || value === 0)
        )
        .forEach(([key, value]) => {
            switch (key) {
            case "gender":
                text = `${text} while its gender is ${value === 1 ? "fe" : ""}male`;
                break;

            case "held_item":
                text = `${text} while holding a ${startCase(value.name)}`;
                break;

            case "known_move":
                text = `${text} ${
                    text.endsWith("Style") ? "" : "while knowing "
                }${startCase(
                    value.name
                )}`;
                break;

            case "known_move_type":
                text = `${text} while knowing a ${startCase(value.name)} type move`;
                break;

            case "location":
                text = `${text} in ${startCase(value.name)}`;
                break;

            case "min_affection":
                text = `${text} while having at least ${value} affection hearts`;
                break;

            case "min_beauty":
                text = `${text} while having a beauty stat of at least ${value}`;
                break;

            case "min_happiness":
                text = `${text} while having at least ${value} happiness points`;
                break;

            case "min_level":
                text = `${text} to level ${value}`;
                break;

            case "needs_overworld_rain":
                text = `${text} while its raining in the overworld`;
                break;

            case "party_species":
                text = `${text} while having a ${startCase(value.name)} in your party`;
                break;

            case "party_type":
                text = `${text} while having a ${startCase(
                    value.name
                )} type Pokémon in your party`;
                break;

            case "relative_physical_stats":
                text = `${text} while its attack stat is ${
                    value === 1 ? "higher than" : value === -1 ? "lower than" : "equal to"
                } its defense stat`;
                break;

            case "time_of_day":
                text = `${text} during the ${value} time`;
                break;

            case "trade_species":
                text = `${text} with a ${startCase(value.name)} specifically`;
                break;

            case "turn_upside_down":
                text = `${text} while your console is upside-down`;
                break;

            default:
                break;
            }
        });

    return text;
};

const locations: Record<string, string[]> = {
    "a strong magnetic field": [
        "mt-coronet",
        "chargestone-cave",
        "kalos-route-13",
    ],
    "a mossy rock": ["eterna-forest", "pinwheel-forest", "kalos-route-20"],
    "an icy rock": ["sinnoh-route-217", "twist-mountain", "frost-cavern"],
    "a snowy mountain peak": ["mount-lanakila"],
};

export const chainFormatter = (chainObject: ChainEvolvesTo): string => {
    let text = startCase(chainObject.species.name);

    if (chainObject.evolution_details.length) {
        const locationEvolutions = chainObject.evolution_details
            .filter((detailsObject) =>
                Boolean(detailsObject.location)
            );
        const nonLocationEvolutions = chainObject.evolution_details.filter(
            (details) =>
                Object.entries(details).some(
                    ([key, value]) =>
                        (key === "trigger" && value.name !== "level-up") ||
          (key !== "trigger" && (Boolean(value) || value === 0))
                ) && details.location === null
        );

        if (locationEvolutions.length) {
            text = `${text} by levelling up next to ${
                Object.keys(locations).find((key) =>
                    locations[key].includes(locationEvolutions[0].location!.name)
                )}`;
        }

        if (nonLocationEvolutions.length) {
            text = `${text}${locationEvolutions.length ? ", or" : ""} by ${
                nonLocationEvolutions
                    .map((details) => detailsParser(details))
                    .join(", or by ")
            }`;
        }
    }

    if (chainObject.evolves_to.length) {
        return `${text} which evolves into ${chainObject.evolves_to
            .map((evolution) => chainFormatter(evolution))
            .join(". It also evolves into ")}`;
    }

    return text;
};

export const pokedexGames: Record<string, string> = {
    "national": "National",
    "kanto": "RGBY/FRLG",
    "original-johto": "GSC",
    "hoenn": "RSE",
    "original-sinnoh": "DP/BDSP",
    "extended-sinnoh": "Platinum",
    "updated-johto": "HGSS",
    "original-unova": "BW",
    "updated-unova": "B2W2",
    "kalos-central": "Central XY",
    "kalos-coastal": "Coastal XY",
    "kalos-mountain": "Mountain XY",
    "updated-hoenn": "ORAS",
    "original-alola": "SM",
    "original-melemele": "SM Melemele",
    "original-akala": "SM Akala",
    "original-ulaula": "SM Ulaula",
    "original-poni": "SM Poni",
    "updated-alola": "USUM",
    "updated-melemele": "USUM Melemele",
    "updated-akala": "USUM Akala",
    "updated-ulaula": "USUM Ulaula",
    "updated-poni": "USUM Poni",
    "letsgo-kanto": "Let's Go",
    "galar": "Base SwSh",
    "isle-of-armor": "Isle of Armor",
    "crown-tundra": "Crown Tundra",
    "hisui": "PL:A",
    "paldea": "Base SV",
    "kitakami": "Kitakami",
    "blueberry": "Blueberry",
};
