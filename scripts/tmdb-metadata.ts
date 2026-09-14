interface TmdbMovie {
    genres: { name: string }[];
    imdb_id: string;
    overview: string;
    poster_path: string | null;
    runtime: number | null;
    vote_average: number;
}

const canonicalImdbUrl = /^https:\/\/www\.imdb\.com\/title\/(tt\d+)\/$/;

/** Resolve films only by their curated IMDb identity, never by a title search. */
export async function fetchSeededMovieMetadata(imdbUrl: string, token: string) {
    const imdbId = canonicalImdbUrl.exec(imdbUrl)?.[1];
    if (!imdbId) {
        throw new Error("Seeded movies require a canonical IMDb title URL");
    }
    const request = async (path: string): Promise<unknown> => {
        const response = await fetch(`https://api.themoviedb.org/3/${path}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
            throw new Error(`TMDB lookup failed for ${imdbId} with status ${response.status}`);
        }
        return response.json();
    };
    const results = (await request(`find/${imdbId}?external_source=imdb_id`)) as {
        movie_results: { id: number }[];
    };
    if (results.movie_results.length !== 1) {
        throw new Error(`TMDB did not return one unique movie for ${imdbId}`);
    }
    const movie = (await request(`movie/${results.movie_results[0].id}`)) as TmdbMovie;
    if (movie.imdb_id !== imdbId) {
        throw new Error(`TMDB returned a different IMDb identity for ${imdbId}`);
    }
    if (!(movie.overview && movie.poster_path && movie.runtime && movie.genres.length)) {
        throw new Error(`TMDB returned incomplete metadata for ${imdbId}`);
    }
    return {
        description: movie.overview,
        genres: movie.genres.map((genre) => genre.name),
        imdbUrl,
        posterUrl: `https://image.tmdb.org/t/p/w780${movie.poster_path}`,
        rating: movie.vote_average,
        runtime: [
            Math.floor(movie.runtime / 60) ? `${Math.floor(movie.runtime / 60)}h` : "",
            movie.runtime % 60 ? `${movie.runtime % 60}m` : "",
        ]
            .filter(Boolean)
            .join(" "),
    };
}
