const { connect, close } = require('../server/db/connection');

async function mergeDuplicates(title, year) {
    if (!title || !year) {
        console.error('Usage: node admin/merge_duplicates.js <title> <year>');
        return;
    }

    const { db } = await connect();
    const moviesCollection = db.collection('movies');
    const ratingsCollection = db.collection('ratings');

    const searchTitle = `${title} (${year})`;
    console.log(`Searching for duplicates of "${searchTitle}"...`);

    const movies = await moviesCollection.find({ title: searchTitle, year: parseInt(year) }).sort({ movieId: 1 }).toArray();

    if (movies.length < 2) {
        console.log('No duplicates found.');
        return;
    }

    const primaryMovie = movies[0];
    const duplicateMovies = movies.slice(1);
    const duplicateMovieIds = duplicateMovies.map(m => m.movieId);

    console.log(`Found ${movies.length} movies. Primary: ${primaryMovie.movieId}. Duplicates: ${duplicateMovieIds.join(', ')}`);

    const session = db.client.startSession();

    try {
        await session.withTransaction(async () => {
            console.log('Starting transaction...');

            const ratingsToMove = await ratingsCollection.find({ movieId: { $in: duplicateMovieIds } }).toArray();
            console.log(`Found ${ratingsToMove.length} ratings to move.`);

            if (ratingsToMove.length > 0) {
                const ratingOps = ratingsToMove.map(rating => {
                    return {
                        updateOne: {
                            filter: { _id: rating._id },
                            update: { $set: { movieId: primaryMovie.movieId } }
                        }
                    };
                });
                await ratingsCollection.bulkWrite(ratingOps);
                console.log('Ratings moved to primary movie.');
            }

            const allRatings = await ratingsCollection.find({ movieId: primaryMovie.movieId }).toArray();
            const totalRating = allRatings.reduce((acc, r) => acc + r.rating, 0);
            const ratingCount = allRatings.length;
            const averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;

            console.log(`Recalculating ratings for primary movie: ${primaryMovie.movieId}`);
            console.log(`New average rating: ${averageRating}, New rating count: ${ratingCount}`);

            await moviesCollection.updateOne(
                { movieId: primaryMovie.movieId },
                { $set: { averageRating, ratingCount } }
            );
            console.log('Primary movie ratings updated.');

            await moviesCollection.deleteMany({ movieId: { $in: duplicateMovieIds } });
            console.log(`Deleted ${duplicateMovies.length} duplicate movies.`);

            console.log('Transaction committed.');
        });
    } catch (error) {
        console.error('Transaction aborted:', error);
    } finally {
        await session.endSession();
        console.log('Session ended.');
    }
}

(async () => {
    try {
        const [,, title, year] = process.argv;
        await mergeDuplicates(title, year);
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await close();
    }
})();