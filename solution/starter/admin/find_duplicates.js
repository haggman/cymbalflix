const { connect, close } = require('../server/db/connection');

async function findDuplicates(title, year) {
    if (!title || !year) {
        console.error('Usage: node admin/find_duplicates.js <title> <year>');
        return;
    }

    const { db } = await connect();
    const moviesCollection = db.collection('movies');

    const searchTitle = `${title} (${year})`;
    console.log(`Searching for duplicates of "${searchTitle}"...`);

    const movies = await moviesCollection.find({ title: searchTitle, year: parseInt(year) }).toArray();
    const movies = await moviesCollection.find({ title: searchTitle }).toArray();

    if (movies.length === 0) {
        console.log('No movies found with that title and year.');
    } else {
        console.log(`Found ${movies.length} movies:`);
        console.log(JSON.stringify(movies, null, 2));
    }

    await close();
}

(async () => {
    try {
        const [,, title, year] = process.argv;
        await findDuplicates(title, year);
    } catch (error) {
        console.error('An error occurred:', error);
    }
})();