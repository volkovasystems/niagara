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
						var error;
						childprocess.exec( "cd " + repository
							+ " && git submodule add https://github.com/volkovasystems/niagara.git niagara" );

					},
					function( ){

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
