// -*- mode: javascript; indent-tabs-mode: nil; c-basic-offset: 8 -*-

// Part of dump1090, a Mode S message decoder for RTLSDR devices.
//
// dbloader.js: load aircraft metadata from static json files
//
// Copyright (c) 2014,2015 Oliver Jowett <oliver@mutability.co.uk>
//
// This file is free software: you may copy, redistribute and/or modify it
// under the terms of the GNU General Public License as published by the
// Free Software Foundation, either version 2 of the License, or (at your
// option) any later version.
//
// This file is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

"use strict";

var _aircraft_cache = {};
var _aircraft_type_cache = null;
var _airport_coords_cache = null;

function getAircraftData(icao) {
	var defer = $.Deferred();
	if (icao.charAt(0) == '~') {
		defer.resolve(null);
		return defer;
	}

	icao = icao.toUpperCase();

	request_from_db(icao, 1, defer);
	return defer;
}

function request_from_db(icao, level, defer) {
	var bkey = icao.substring(0, level);
	var dkey = icao.substring(level);
	var req = db_ajax(bkey);

	req.done(function(data) {
		var subkey;

		if (data == null) {
			defer.resolve("strange");
			return;
		}

		if (dkey in data) {
			getIcaoAircraftTypeData(data[dkey], defer);
			return;
		}

		if ("children" in data) {
			subkey = bkey + dkey.substring(0,1);
			if (data.children.indexOf(subkey) != -1) {
				request_from_db(icao, level+1, defer);
				return;
			}
		}
		defer.resolve(null);
	});

	req.fail(function(jqXHR,textStatus,errorThrown) {
		defer.reject(jqXHR,textStatus,errorThrown);
	});
}

function getIcaoAircraftTypeData(aircraftData, defer) {
	if (_aircraft_type_cache === null) {
		$.getJSON("db2/aircraft_types/icao_aircraft_types.json")
			.done(function(typeLookupData) {
				_aircraft_type_cache = typeLookupData;
			})
			.always(function() {
				lookupIcaoAircraftType(aircraftData, defer);
			});
	}
	else {
		lookupIcaoAircraftType(aircraftData, defer);
	}
}


// format [r:0, t:1, f:2]
// 3: desc
// 4: wtc
function lookupIcaoAircraftType(aircraftData, defer) {
	if (_aircraft_type_cache !== null && aircraftData[1]) {
		var typeDesignator = aircraftData[1].toUpperCase();
		if (typeDesignator in _aircraft_type_cache) {
			var typeData = _aircraft_type_cache[typeDesignator];
			if (typeData.desc != null && typeData.desc.length == 3) {
				aircraftData[3] = typeData.desc;
			}
			if (typeData.wtc != undefined && aircraftData.wtc === undefined) {
				aircraftData[4] = typeData.wtc;
			}
		}
	}

	defer.resolve(aircraftData);
}

var _request_count = 0;
var _request_queue = [];
var _request_cache = {};

function db_ajax(bkey) {
	var req;

	if (bkey in _request_cache) {
		return _request_cache[bkey];
	}

	req = _request_cache[bkey] = $.Deferred();
	req.bkey = bkey;
	// put it in the queue
	_request_queue.push(req);
	db_ajax_request_complete();

	return req;
}

function db_ajax_request_complete() {
	var req;
	var ajaxreq;

	if (_request_queue.length == 0 || _request_count >= 1) {
		return;
	} else {
		_request_count++;
		req = _request_queue.shift();
		const req_url = 'db2/' + req.bkey + '.json';
		ajaxreq = $.ajax({ url: req_url,
			cache: true,
			timeout: 30000,
			dataType : 'json' });
		ajaxreq.done(function(data) { req.resolve(data); });
		ajaxreq.fail(function(jqxhr, status, error) {
			if (status == 'timeout') {
				delete _request_cache[req.bkey];
			}
			jqxhr.url = req_url;
			req.reject(jqxhr, status, error);
		});
		ajaxreq.always(function() {
			_request_count--;
			db_ajax_request_complete();
		});
	}
}
