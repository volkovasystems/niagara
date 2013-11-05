var childprocess = require( "child_process" );
var util = require( "util" );
var fs = require( "fs" );
var async = require( "async" );
var _ = require( "underscore" );
var S = require( "string" );

/*
	Niagara 

	This project aims to automate large modularize project workflows.

	Assuming that this large project only has 1 repository account in github,
		we can have the user to logged only once.

	Niagara has a console command 'niagara' or 'ngra'.

	The base workflow for initialization is to construct a base project
		architecture.

	large-project-root-folder/
		-> repo-A-folder/
		-> repo-B-folder/
		-> repo-C-folder/

	And clone the niagara repository to large-project-root-folder

	large-project-root-folder/
		-> repo-A-folder/
		-> repo-B-folder/
		-> repo-C-folder/
		-> niagara/

	Inside niagara, before launching the niagara command,
		configure the spring.json file.

	The spring.json file contains an array structure containing
		configuration for any repository in your list.
		
		[
			{
				"repository": "your repo name",
				"username": "your user name",
				"password": "your password"
			}
			...
		]

		If multiple remote version control system is supported
			this will be extended to include 'type' and 'option'
			for specific initialization.

		* Note that these configuration files are automatically ignored.

	Once spring.json is configured, type in 'niagara falls'

	This will boot the niagara and started inspecting each repository.

	large-project-root-folder/
		-> repo-A-folder/
			-> niagara/
			-> waterfall.json
		-> repo-B-folder/
			-> niagara/
			-> waterfall.json
		-> repo-C-folder/
			-> niagara/
			-> waterfall.json
		-> niagara/
			-> waterfall.json
			-> spring.json

	Each repository will be added with niagara sub module and waterfall.json

	waterfall.json is niagara's main configuration file.

	The niagara engine will only read the waterfall.json file aside from other configuration
		file like spring.json and river.json.

	Niagara is closely tied to grunt, bower, npm, git and other javascript frameworks.

	Niagara features:
		1. Launch test workflows.
			The developer has to boot niagara then the niagara engine will always
			listen to river.json (which is a configuration for all engines)
			Changes to the river.json affects the control flow of niagara.
			If river.json is empty or non-existent then it will default to base control flow.
			In river.json a 'test' entry is added that will point to the list of
				test files to be executed.
			If this is existing then niagara will start adding the test flow in the list of
				workflows.

		2. Auto deploy.
			Niagara has command like 'niagara evaporate' which will auto deploy
				the niagara binded project to the public making your project accessible to everyone
				This will convert the repository in production mode.
			Add an entry for 'deploy' should be added.
			
			"deploy": {
				"type": "production|development",
				"branch": "branch name of project's deployment",
				"url": "url to launch after deployment",
				"test": true|false, //defaults to true and this is optional.
				"documentation": true|false, //defaults to false and this is optional
				""
			}

			If documentation is true, it will launch the documentation bundled with the
				project. Just put a 'documentation' entry in the river.json

			Auto deploy has strong ties with openshift, google app engine, and appfog.

			The usual deployment strategy is to update the remote git repo,
				it is the task of the servers to update themselves through the remote
				git repo.

		3. Synchronize flows.
			The niagara engine is always live on boot. Put an entry on
				your start up program list to boot niagara on system starts.

			Niagara will always fetch-prune and pull latest changes to the remote repository
				but it will not merge them. Instead, it will create a branch
				for you to merge unless the message for the current pulled index
				contains a '@force-flow' command.

			Immediate pull-merge should contain an override priority value in the message.
				This priority value is stated in the river.json through the engines.

			If the priority value exceeds the required priority value on the engine
				it will automatically merge the changes.

			Note that niagara contains a list of access hash to be appended to the message
				command.

			Example:
				@force-flow:gjdfgklsdf4454343tsmgdkldf

				@priority-override:120
				@force-flow:gjdfgklsdf4454343tsmgdkldf				

		4. Integrated dashboard.
			The niagara will host a remote dashboard and a local dashboard for your
				projects.

			The dashboard enables you to share and collaborate project workflows
				and improve software development as a team.

			The dashboard aims to singularize the workflow of the team by providing
				status and updates in real time.
				* What each member is on a code task
				* What each member is experiencing per code task.
				* The duration each member per code task.
				* Updates of the code task if it is running smoothly or having errors.

			The dashboard is basically an independent application that only focuses
				on the updates that each member is posting to the niagara server.

			So if a member runs a test, the project manager knows, or if the test fails on
				the code task this member is testing, the project manager is direclty notified.
				If the code task is difficult the project manager is notified (which is based
				on the given duration)

			The dashboard has an integrated collaborating tools that speeds up development.
*/

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
					//	if this is a git repo and if there is a niagara sub module.
					//We will get the path that fails any of these conditions.
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

											TOOD:
											I'm thinking of creating a tag to this commit
												instead of having the user a branch to merge.
												Because the branch may change but the tag cannot.
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
						var error;
						var currentProcess = childprocess.exec( "cd " + repository 
							+ " && git add --all" );
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
						//Commit current changes.
						var error;
						var currentProcess = childprocess.exec( "cd " + repository 
							+ " && git commit -m \"added niagara sub module\"" );
						currentProcess.stderr.on( "data",
							function( data ){
								error = new Error( data.toString( ) );
							} );
						currentProcess.on( "close",
							function( ){
								callback( error, previousBranch );
							} );
					},

					function( callback ){
						//Push current changes.
						var error;
						var currentProcess = childprocess.exec( "cd " + repository 
							+ " && git push --repo https://volkovasystems:Enigmata123@github.com/volkovasystems/" );
						currentProcess.stderr.on( "data",
							function( data ){
								error = new Error( data.toString( ) );
							} );
						currentProcess.on( "close",
							function( ){
								callback( error, previousBranch );
							} );
					},

					function( callback ){
						//Write the waterfall.json
						/*
							{
								"dry": true|false, //do not include dry waterfall.json
								"flowing": true|false, //booted correctly.
								"clogged": true|false, //encountered an error.
								"repository": "name of repository",
								"repositoryUrl": "url of repository",
								"type": "root" | "child"
							}
						*/
					}
				] );
		},
		function( error ){

		} );
};

var fireNiagaraServer = function fireNiagaraServer( ){

};



var boot = function boot( ){

};
exports.boot = boot;

boot( );
