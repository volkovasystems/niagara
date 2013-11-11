var fs = require( "fs" );
var async = require( "async" );

fs.readdir( "../",
	function( error, fileList ){
		if( error ){
			console.log( error );
			process.exit( 1 );
			return;
		}

		async.map( fileList,
			function( fileName, callback ){
				var filePath =  "../" + fileName;
				fs.stat( filePath,
					function( error, fileStatistic ){
						if( error ){
							console.log( error );
						}
						if( fileStatistic.isDirectory( ) ){
							callback( null, filePath );
						}else{
							callback( error );
						}
					} )
			},
			function( error, directoryList ){
				if( error ){
					console.log( error );
					process.exit( 1 );
				}

				

			} );
	} );