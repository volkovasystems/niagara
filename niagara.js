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

var boot = function boot( ){
	async.parallel( checkPrimaryDependencies( ),
		function( error, results ){
			if( error ){
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
		} );
};
exports.boot = boot;

boot( );
