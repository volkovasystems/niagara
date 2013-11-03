var childprocess = require( "child_process" );
var util = require( "util" );
var fs = require( "fs" );
var async = require( "async" );
var _ = require( "underscore" );
var S = require( "string" );

var checkPrimaryDependencies = function checkPrimaryDependencies( ){
	var primaryDependencyList = [
		{
			"name": "git",
			"command": "git --version"
		},
		{
			"name": "nodejs",
			"command": "node --version"
		},
		{
			"name": "grunt",
			"command": "grunt --version"
		},
		{
			"name": "mongodb",
			"command": "mongod --version"
		},
		{
			"name": "redis",
			"command": "redis-server --version"
		}
	];

	return _.map( primaryDependencyList,
		function( dependency ){
			return ( function checkDependency( callback ){
				var version = "";
				var error = "";
				var currentProcess = childprocess.exec( dependency.command );
				currentProcess.stdout.on( "data",
					function( data ){
						version = data.toString( ).trim( );
					} );
				currentProcess.stderr.on( "data",
					function( data ){
						error = data.toString( ).trim( );
					} );
				currentProcess.on( "close",
					function( ){
						if( error ){
							callback( error );
							return;
						}
						var result = { };
						result[ dependency.name ] = version;
						callback( null, result );
					} );
			} );
		} );
};

var updateConfiguration = function updateConfiguration( callback ){
	async.parallel( checkPrimaryDependencies( ),
		function( error, results ){
			if( error ){
				callback( error );
				return;
			}

			var waterfallConfig = { };
			if( !_.isEmpty( results ) ){
				_.each( results,
					function( dependency ){
						var key = _.keys( dependency )[ 0 ];
						var value = _.values( dependency )[ 0 ];
						waterfallConfig[ key ] = value;
					} );
			}

			//Get the current version of this niagara.
			//Initial version is in the package.json.
			//Succeeding version should be in the root waterfall.json
			fs.exists( "./waterfall.json",
				function( exists ){
					if( !exists ){
						fs.exists( "./package.json",
							function( exists ){
								if( exists ){
									fs.readFile( "./package.json",
										{ "encoding": "utf8" },
										function( error, data ){
											if( error ){
												callback( error );
												return;
											}
											waterfallConfig.version = data.version;
											fs.writeFile( "./waterfall.json",
												JSON.stringify( waterfallConfig, null, "\t" ),
												function( error ){
													callback( error );
												} );
										} );
								}else{
									callback( new Error( "package.json does not exists" ) );
								}
							} );
					}else{
						//We already have the waterfall configuration
						//	update and extract the version number.
						fs.readFile( "./waterfall.json",
							{ "encoding": "utf8" },
							function( error, data ){
								if( error ){
									callback( error );
									return;
								}
								waterfallConfig.version = data.version;
								fs.writeFile( "./waterfall.json",
									JSON.stringify( waterfallConfig, null, "\t" ),
									function( error ){
										callback( error );
									} );
							} );
					}
				} );
		} );
};

var checkSiblingRepository = function checkSiblingRepository( callback ){
	//We will traverse the sibling directories and ignore folders
	//	with "library" or "niagara" in the name.
	fs.readdir( "../",
		function( error, fileList ){
			async.map( fileList,
				function( fileName, callback ){
					fs.stat( "../" + fileName,
						function( error, stat ){
							if( stat.isDirectory( )
								&& !( /library|niagara/ ).test( fileName ) )
							{
								callback( null, "../" + fileName );
								return;
							}
							callback( );
						} );
				},
				function( error, directoryList ){
					if( error ){
						callback( error );
						return;
					}
					//We will check for the waterfall.json file,
					//	the .git folder and the niagara repository folder
					//We will get the folder that fails any of these conditions.
					async.map( directoryList,
						function( directoryPath, callback ){
							async.parallel( [
									function( callback ){
										//Check if waterfall.json exists
										fs.exists( directoryPath + "/waterfall.json",
											function( exists ){
												callback( null, exists );
											} );
									},
									function( callback ){
										//Check if this is a git repo.
										var error;
										var currentProcess = childprocess.exec( "cd " + directoryPath + " && git status" );
										currentProcess.stderr.on( "data",
											function( data ){
												error = new Error( data.toString( ) );
											} );
										currentProcess.on( "close",
											function( ){
												callback( error, !error );
											} );
									},
									function( callback ){
										//Check if this contains a niagara repository.
										var error;
										var currentProcess = childprocess.exec( "cd " + directoryPath + "/niagara"
											+ " && git status" );
										currentProcess.stderr.on( "data",
											function( data ){
												error = new Error( data.toString( ) );
											} );
										currentProcess.on( "close",
											function( ){
												callback( error, !error );
											} );
									}
								],
								function( error, results ){
									if( error ){
										callback( error );
										return;
									}
									if( results.length != 3 ){
										callback( null, directoryPath );
									}else{
										callback( );
									}
								} );
						},
						function( error, repositoryList ){
							callback( error, repositoryList );
						} );
				} );
		} );
};

var integrateNiagara = function integrateNiagara( repositoryList, callback ){
	//We will access the repository and add a sub module
	//	for niagara. After the sub module is added
	//	we will auto commit and push it and fire the niagara engine.

	async.each( repositoryList,
		function( repository, callback ){
			async.waterfall( [
					function( callback ){
						//Check if there are changes.
						var error;
						var hasChanges;
						var currentProcess = childprocess.exec( "cd " + repository + " && git status --porcelain" );
						currentProcess.stdout.on( "data",
							function( data ){
								hasChanges = hasChanges || ( /[\s?MARDUC]{2}/ ).test( data.toString( ) );
 							} );
						currentProcess.stderr.on( "data",
							function( data ){
								error = new Error( data.toString( ) );
							} );
						currentProcess.on( "close",
							function( ){
								callback( error, hasChanges );
							} );
					},

					function( hasChanges, callback ){
						//Stash anything uncommitted first.
						if( hasChanges ){
							//Create a random branch and stash-commit changes there.
							async.waterfall( [
									function( callback ){
										//Check if there are other stashes abort if there are.
										var hasStashes;
										var error;
										var currentProcess = childprocess.exec( "cd " + repository 
											+ " && git stash list" );
										currentProcess.stdout.on( "data",
											function( data ){
												hasStashes = hasStashes || ( /stash@\{\d+\}/ ).test( data.toString( ) );
											} );
										currentProcess.stderr.on( "data",
											function( data ){
												error = new Error( data.toString( ) );
											} );
										currentProcess.on( "close",
											function( ){
												if( hasStashes ){
													error = new Error( "conflicting stash" );
												}
												callback( error );
											} );
									},

									function( callback ){
										//Create a stash
										var error;
										var currentProcess = childprocess.exec( "cd " + repository 
											+ " && git stash" );
										currentProcess.stderr.on( "data",
											function( data ){
												error = new Error( data.toString( ) );
											} );
										currentProcess.on( "close",
											function( ){
												callback( error );
											} );
									},

									function( callback ){
										//Get the current branch name.
										var error;
										var branch;
										var currentProcess = childprocess.exec( "cd " + repository 
											+ " && git show-branch --current" );
										currentProcess.stdout.on( "data",
											function( data ){
												branch = data.toString( ).match( /(?:\[)(.+)(?:\])/ )[ 1 ];
				 							} );
										currentProcess.stderr.on( "data",
											function( data ){
												error = new Error( data.toString( ) );
											} );
										currentProcess.on( "close",
											function( ){
												callback( error, branch );
											} );
									},

									function( branch, callback ){
										//Get the current branch hash.
										var error;
										var branchHash;
										var currentProcess = childprocess.exec( "cd " + repository 
											+ " && git show-branch --current --sha1-name" );
										currentProcess.stdout.on( "data",
											function( data ){
												branchHash = data.toString( ).match( /(?:\[)(.+)(?:\])/ )[ 1 ];
				 							} );
										currentProcess.stderr.on( "data",
											function( data ){
												error = new Error( data.toString( ) );
											} );
										currentProcess.on( "close",
											function( ){
												callback( error, branch, branchHash );
											} );
									},

									function( branch, branchHash, callback ){
										//Create a branch then transfer changes to the branch-branchHash
										var branchName = "stash-" + branch + "-" + branchHash;
										var error;
										var currentProcess = childprocess.exec( "cd " + repository 
											+ " && git stash branch " + branchName );
										currentProcess.stderr.on( "data",
											function( data ){
												error = new Error( data.toString( ) );
											} );
										currentProcess.on( "close",
											function( ){
												callback( error, branchName, previousBranch );
											} );
									},

									function( branchName, previousBranch, callback ){
										//Add the changes to that branch.
										var error;
										var currentProcess = childprocess.exec( "cd " + repository 
											+ " && git add --all" );
										currentProcess.stderr.on( "data",
											function( data ){
												error = new Error( data.toString( ) );
											} );
										currentProcess.on( "close",
											function( ){
												callback( error, branchName, previousBranch );
											} );
									},

									function( branchName, previousBranch, callback ){
										//Commit the changes to that branch.
										var error;
										var currentProcess = childprocess.exec( "cd " + repository 
											+ " && git commit -m \"stash commit on " + branchName + "\"" );
										currentProcess.stderr.on( "data",
											function( data ){
												error = new Error( data.toString( ) );
											} );
										currentProcess.on( "close",
											function( ){
												callback( error, previousBranch );
											} );

										/*
											After we commit the changes to that branch
												we leave it for the user to merge it or not.
											But this will only happen in rare cases.
											Niagara should be added when a project is created.
											This is ideal. So this scenario will only happen
												if niagara is added in the middle of the workflow
												of the project.
										*/
									},

									function( previousBranch, callback ){
										//Checkout previous branch.
										var error;
										var currentProcess = childprocess.exec( "cd " + repository 
											+ " && git checkout " + previousBranch );
										currentProcess.stderr.on( "data",
											function( data ){
												error = new Error( data.toString( ) );
											} );
										currentProcess.on( "close",
											function( ){
												callback( error );
											} );

										/*
											This is done because 'git stash branch'
												checkout that newly created branch
												so we really have to go back to the original branch
												to add the sub module for niagara.
										*/
									}
								],
								function( error ){
									callback( error );
								} );
						}else{
							callback( );
						}
					},

					function( callback ){
						//Do a git pull if there is anything to pull.
						var error;
						var currentProcess = childprocess.exec( "cd " + repository + " && git pull" );
						currentProcess.stderr.on( "data",
							function( data ){
								error = new Error( data.toString( ) );
							} );
						currentProcess.on( "close",
							function( ){
								callback( error );
							} );
					},

					function( callback ){
						//Add niagara sub module.
						var error;
						var currentProcess = childprocess.exec( "cd " + repository
							+ " && git submodule add https://github.com/volkovasystems/niagara.git niagara" );
						currentProcess.stderr.on( "data",
							function( data ){
								error = new Error( data.toString( ) );
							} );
						currentProcess.on( "close",
							function( ){
								callback( error );
							} );
					},

					function( callback ){
						//Add any current changes.
					},

					function( callback ){
						//Commit current changes.
					},

					function( callback ){
						//Push current changes.
					}
				] );
		},
		function( error ){

		} );
};

var boot = function boot( ){

};
exports.boot = boot;

boot( );
