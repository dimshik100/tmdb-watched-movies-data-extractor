var request = require("request");
var jsonfile = require('jsonfile');
var moment = require("moment");
const dotenv = require('dotenv').config();

var baseUrl = 'https://api.themoviedb.org';
var apiKey = process.env.TMDB_API_KEY;

var movieLists = process.env.TMDB_MOVIE_LISTS.split(',');

var moviesFromAllLists = [];

var listTotalNumberOfPages = undefined;
var nextListPage = 1;
var currentMovieList = [];

function getListPage(listId, pageNumber, promiseResolveCB) {
  console.log(`Getting page ${pageNumber} from list ${listId}`);
  var options = {
    method: 'GET',
    url: `${baseUrl}/4/list/${listId}`,
    qs: { api_key: apiKey, page: pageNumber },
    headers:
    {
      authorization: 'Bearer <<access_token>>',
      'content-type': 'application/json;charset=utf-8'
    },
    json: true
  };

  request(options, function (error, response, body) {
    if (error) throw new Error(error);

    //console.log(body);

    // adding results
    currentMovieList = currentMovieList.concat(body.results);
    // updating counters
    updateListPagesCounter(body.total_pages, body.page);

    // get the next page after 1 second from getting the last results
    // this is to prevent the Request Rate Limiting
    // https://developers.themoviedb.org/3/getting-started/request-rate-limiting


    if (nextListPage <= listTotalNumberOfPages) {
      // TODO: remove this line after finish debugging
      // if (nextListPage <= 2) {
      setTimeout(() => {
        getListPage(listId, nextListPage, promiseResolveCB);
      }, 1000);
    } else {
      promiseResolveCB(currentMovieList);

    }
  });
}

function updateListPagesCounter(totalPages, currentPage) {
  // set the next page
  nextListPage = currentPage + 1;

  if (listTotalNumberOfPages === undefined) {
    // set the total number of pages from the first request
    listTotalNumberOfPages = totalPages;
  } else if (listTotalNumberOfPages === currentPage) {

  }
}

function getMovieList(listId) {
  var promise = new Promise((resolve) => {
    getListPage(listId, 1, resolve);
  });

  return promise;
}

async function getAllListsData() {
  for (let listId of movieLists) {
    var movieList = await getMovieList(listId);
    moviesFromAllLists = moviesFromAllLists.concat(movieList);

    // reset the total number of pages if reached the last one
    listTotalNumberOfPages = undefined;
    // reset the current movie list
    currentMovieList = [];
  }
  // finished getting all lists
  console.log(`Saving ${moviesFromAllLists.length} movies`);
  var file = 'movies_from_all_lists.json';
  jsonfile.writeFile(file, moviesFromAllLists, { spaces: 2 }, function (err) {
    console.error(err)
  });
}





function getMovieFullData(movieId) {
  console.log(`getting full movie data for id ${movieId}`);
  var promise = new Promise((resolve) => {
    var options = {
      method: 'GET',
      url: `${baseUrl}/3/movie/${movieId}`,
      qs: {
        api_key: apiKey,
        append_to_response: "credits"
      },
      body: '{}'
    };

    request(options, function (error, response, body) {
      if (error) {
        throw new Error(error);
      }
      resolve(JSON.parse(body));
      // console.log(JSON.parse(body));
    });
  });

  return promise;
}


const generalData = {
  totalRuntimeInMinutes: 0
}

function getGeneralData(movie) {
  generalData.totalRuntimeInMinutes += movie.runtime;
}

const castData = {
  top5cast: {

  },
  allCast: {

  }
}

function getCastData(castArr) {
  for (const actor of castArr) {
    let castDataGroup;

    // check if in top 5
    if (actor.order <= 5) {
      castDataGroup = castData.top5cast;
    } else {
      castDataGroup = castData.allCast;
    }

    // check if we already have this actor in castData
    if (castDataGroup.hasOwnProperty(actor.id)) {
      castDataGroup[actor.id].numberOfMovies += 1;
      castDataGroup[actor.id].characters.push(actor.character);
    } else {
      castDataGroup[actor.id] = {
        characters: [actor.character],
        gender: actor.gender,
        name: actor.name,
        profilePath: actor.profile_path,
        numberOfMovies: 1
      }
    }
  }
}

// TODO: Improve this flow by loading existing "full-movies-data.json" and getting
// full movie data only for movies not in the list.
async function getAllMoviesFullData() {
  var file = 'movies_from_all_lists_by_id.json';
  jsonfile.readFile(file, async function (err, obj) {
    // console.dir(obj);
    let movieIds = Object.keys(obj);

    // TODO: remove this after debugging
    // shortening the array for quick testing
    // movieIds.length = 350;
    console.log(`getting full movie data for ${movieIds.length} movies`);


    // get full data for each movie
    const moviesFullData = {};
    for (let movieId of movieIds) {
      var movieFullData = await getMovieFullData(movieId);

      // process movie general data
      getGeneralData(movieFullData);

      // process movie cast data
      getCastData(movieFullData.credits.cast);

      moviesFullData[movieFullData.id] = movieFullData;
    }

    // finished getting all full movies data
    console.log(`Saving ${Object.keys(moviesFullData).length} full movies`);
    var file = 'full-movies-data.json';
    jsonfile.writeFile(file, moviesFullData, { spaces: 2 }, function (err) {
      console.error(err)
    });


    console.log(`Saving general data`);
    var file = 'general-data.json';
    jsonfile.writeFile(file, generalData, { spaces: 2 }, function (err) {
      console.error(err)
    });


    console.log(`Saving cast data`);
    var file = 'cast-data.json';
    jsonfile.writeFile(file, castData, { spaces: 2 }, function (err) {
      console.error(err)
    });
  });
}



function cleanDuplicates() {
  const moviesFromAllLists = {};
  var file = 'movies_from_all_lists.json';
  jsonfile.readFile(file, function (err, moviesArr) {
    // console.dir(moviesArr);
    const duplicates = [];
    for (const movie of moviesArr) {
      if (moviesFromAllLists.hasOwnProperty(movie.id)) {
        // found a duplicate, don't save it
        console.log('found a duplicate', movie.title);
        duplicates.push(movie);
      } else {
        // save movie to list
        moviesFromAllLists[movie.id] = movie;
      }
    }

    console.log(`Found ${duplicates.length} duplicates`);
    console.log(`Saving total ${Object.keys(moviesFromAllLists).length} unique movies`)

    var file = 'movies_from_all_lists_by_id.json';
    jsonfile.writeFile(file, moviesFromAllLists, { spaces: 2 }, function (err) {
      console.error(err)
    });
  });
}


function collectInsights() {
  const insights = {
    total_number_of_movies: 0,
    total_runtime_in_minutes: 0,
    oldest_movie_by_release_date: {
      id: undefined,
      date: undefined,
      title: undefined
    },
    newest_movie_by_release_date: {
      id: undefined,
      date: undefined,
      title: undefined
    },
    longest_movie: {
      id: undefined,
      runtime: undefined,
      title: undefined
    },
    shortest_movie: {
      id: undefined,
      runtime: undefined,
      title: undefined
    },
    highest_budget: {
      id: undefined,
      budget: undefined,
      title: undefined
    },
    lowest_budget: {
      id: undefined,
      budget: undefined,
      title: undefined
    },
    highest_revenue: {
      id: undefined,
      revenue: undefined,
      title: undefined
    },
    lowest_revenue: {
      id: undefined,
      revenue: undefined,
      title: undefined
    }
  }
  var file = 'full-movies-data.json';
  jsonfile.readFile(file, function (err, moviesObj) {

    // update number of movies
    insights.total_number_of_movies = Object.keys(moviesObj).length;

    for (const movieId in moviesObj) {
      const movie = moviesObj[movieId];

      // update movies total runtime
      insights.total_runtime_in_minutes += movie.runtime;

      // update oldest movie           
      if (!insights.oldest_movie_by_release_date.id || moment(movie.release_date).isBefore(insights.oldest_movie_by_release_date.date)) {
        insights.oldest_movie_by_release_date.date = movie.release_date;
        insights.oldest_movie_by_release_date.id = movie.id;
        insights.oldest_movie_by_release_date.title = movie.title;
      }

      // update newest movie
      if (!insights.newest_movie_by_release_date.id || moment(movie.release_date).isAfter(insights.newest_movie_by_release_date.date)) {
        insights.newest_movie_by_release_date.date = movie.release_date;
        insights.newest_movie_by_release_date.id = movie.id;
        insights.newest_movie_by_release_date.title = movie.title;
      }

      if (movie.runtime !== null) {
        // update longest movie
        if (!insights.longest_movie.id || movie.runtime > insights.longest_movie.runtime) {
          insights.longest_movie.id = movie.id;
          insights.longest_movie.runtime = movie.runtime;
          insights.longest_movie.title = movie.title;
        }

        // update shortest movie
        if (!insights.shortest_movie.id || movie.runtime < insights.shortest_movie.runtime) {
          insights.shortest_movie.id = movie.id;
          insights.shortest_movie.runtime = movie.runtime;
          insights.shortest_movie.title = movie.title;
        }
      }

      if (movie.budget !== 0) {
        // update highest budget
        if (!insights.highest_budget.id || movie.budget > insights.highest_budget.budget) {
          insights.highest_budget.id = movie.id;
          insights.highest_budget.budget = movie.budget;
          insights.highest_budget.title = movie.title;
        }

        // update lowest budget
        if (!insights.lowest_budget.id || movie.budget < insights.lowest_budget.budget) {
          insights.lowest_budget.id = movie.id;
          insights.lowest_budget.budget = movie.budget;
          insights.lowest_budget.title = movie.title;
        }
      }

      if (movie.revenue !== 0) {
        // update highest revenue
        if (!insights.highest_revenue.id || movie.revenue > insights.highest_revenue.revenue) {
          insights.highest_revenue.id = movie.id;
          insights.highest_revenue.revenue = movie.revenue;
          insights.highest_revenue.title = movie.title;
        }

        // update lowest revenue
        if (!insights.lowest_revenue.id || movie.revenue < insights.lowest_revenue.revenue) {
          insights.lowest_revenue.id = movie.id;
          insights.lowest_revenue.revenue = movie.revenue;
          insights.lowest_revenue.title = movie.title;
        }
      }
    }

    var file = 'insights.json';
    jsonfile.writeFile(file, insights, { spaces: 2 }, function (err) {
      console.error(err)
    });
  });
}


function sortCastData() {
  var file = 'cast-data.json';
  jsonfile.readFile(file, function (err, castDataObj) {
    let newCastDataObj = {};
    // top5cast
    var sortable = [];
    for (var actorId in castDataObj.top5cast) {
      const actor = castDataObj.top5cast[actorId];

      if (actor.numberOfMovies === 1) {
        continue;
      }

      delete actor.characters;

      sortable.push([actorId, actor]);
    }

    sortable.sort(function (a, b) {
      return a[1].numberOfMovies - b[1].numberOfMovies;
    });

    newCastDataObj.top5cast = sortable.reverse();


    // allCast
    sortable = [];
    for (var actorId in castDataObj.allCast) {
      const actor = castDataObj.allCast[actorId];

      if (actor.numberOfMovies === 1) {
        continue;
      }

      delete actor.characters;

      sortable.push([actorId, actor]);
    }
    sortable.sort(function (a, b) {
      return a[1].numberOfMovies - b[1].numberOfMovies;
    });

    newCastDataObj.allCast = sortable.reverse();

    // save file
    var file = 'sorted-cast-data.json';
    jsonfile.writeFile(file, newCastDataObj, { spaces: 2 }, function (err) {
      console.error(err)
    });

    // calculate total number of unique actors 
    const top5castArr = Object.keys(castDataObj.top5cast);
    const allCastArr = Object.keys(castDataObj.allCast);
    const uniqueActorsIds = top5castArr.concat(allCastArr.filter(function (item) {
      return top5castArr.indexOf(item) < 0;
    }));
    console.log('Total unique actors: ', uniqueActorsIds.length);

    /////////////////////////////////////////////////////////////////////////////////////////////////////

    // calculate total number of appearances per actor
    let totalNumberOfAppearancesPerActor = {};
    for (const actorId of uniqueActorsIds) {
      if (castDataObj.top5cast.hasOwnProperty(actorId)) {
        totalNumberOfAppearancesPerActor[actorId] = {
          name: castDataObj.top5cast[actorId].name,
          totalNumberOfAppearances: castDataObj.top5cast[actorId].numberOfMovies
        }
      }
      if (castDataObj.allCast.hasOwnProperty(actorId)) {
        if (totalNumberOfAppearancesPerActor.hasOwnProperty(actorId)) {
          totalNumberOfAppearancesPerActor[actorId].totalNumberOfAppearances += castDataObj.allCast[actorId].numberOfMovies;
        } else {
          totalNumberOfAppearancesPerActor[actorId] = {
            name: castDataObj.allCast[actorId].name,
            totalNumberOfAppearances: castDataObj.allCast[actorId].numberOfMovies
          }
        }
      }
    }

    // totalNumberOfAppearancesPerActor
    sortable = [];
    for (var actorId in totalNumberOfAppearancesPerActor) {
      const actor = totalNumberOfAppearancesPerActor[actorId];

      if (actor.totalNumberOfAppearances === 1) {
        continue;
      }

      delete actor.characters;

      sortable.push([actorId, actor]);
    }
    sortable.sort(function (a, b) {
      return a[1].totalNumberOfAppearances - b[1].totalNumberOfAppearances;
    });

    totalNumberOfAppearancesPerActor = sortable.reverse();


    // save file
    var file = 'total-number-of-appearances-cast-data.json';
    jsonfile.writeFile(file, totalNumberOfAppearancesPerActor, { spaces: 2 }, function (err) {
      console.error(err)
    });


  });
}


function createGenresDistribution() {
  var file = 'full-movies-data.json';
  jsonfile.readFile(file, function (err, moviesObj) {
    let moviesByGenre = {};

    for (const movieId in moviesObj) {
      const movie = moviesObj[movieId];

      for (const genre of movie.genres) {
        if (moviesByGenre.hasOwnProperty(genre.id)) {
          moviesByGenre[genre.id].numberOfMovies += 1;
        } else {
          moviesByGenre[genre.id] = {
            name: genre.name,
            numberOfMovies: 1
          }
        }
      }
    }



    var sortable = [];
    for (var genreId in moviesByGenre) {
      const genre = moviesByGenre[genreId];

      sortable.push([genreId, genre]);
    }

    sortable.sort(function (a, b) {
      return a[1].numberOfMovies - b[1].numberOfMovies;
    });

    moviesByGenre = sortable.reverse();

    // save file
    var file = 'number-of-movies-by-genre.json';
    jsonfile.writeFile(file, moviesByGenre, { spaces: 2 }, function (err) {
      console.error(err)
    });
  });
}

function createIdsArray() {
  var file = 'movies_from_all_lists_by_id.json';
  jsonfile.readFile(file, async function (err, obj) {
    let movieIds = {
      movies: Object.keys(obj).map((id) => {
        return parseInt(id);
      })
    };

    console.log(`Saving ids data`);
    var file = 'watched-movies-ids.json';
    jsonfile.writeFile(file, movieIds, { spaces: 2 }, function (err) {
      console.error(err)
    });
  });

}

// STEP: 1
// get short data from all lists and save to 'movies_from_all_lists.json'
// getAllListsData();


// STEP: 2
// check lists data for duplicates, remove them and re-save the file 'movies_from_all_lists_by_id.json'
// cleanDuplicates();


// STEP: 3
// get full movie data for all movies from 'movies_from_all_lists_by_id.json'
// getAllMoviesFullData();

// STEP: 4
// analyze movies full data and collect insights
// collectInsights();

// STEP: 5
// sort cast data by numberOfMovies
// sortCastData();

// STEP: 6
// calculate number of movies per genre
// createGenresDistribution();

// STEP: 7
// create all watched movies ids array json
createIdsArray();




// TODO: 
// get movie with the most spoken_languages
// get directors ("job": "Director") array sorted by number of movies
// get producers ("job": "Producer") array sorted by number of movies
// get Composers ("job": "Original Music Composer") array sorted by number of movies
// get most movies performed as lead male actor (top 5)
// get most movies performed as lead female actor (top 5)
// 
