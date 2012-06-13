///////////////////////
// Author: Eric Bridger ebridger@gmri.org  eric.bridger@gmail.com
// Date:   Feb. 2011
// Describption: Use JQuery to parse OGC Sensor Observation Service GetObservation response XML in SWE CF 1.6 IOOS Profiles
// Requires:  jQuery 1.5 http://code.jquery.com/jquery-1.5.min.js
// Tested with:  jQuery 1.6.1 http://code.jquery.com/jquery-1.6.1.min.js
// Tested with:  jQuery 1.7.1 http://code.jquery.com/jquery-1.7.1.min.js
//
// Wed Feb 15 12:34:15 EST 2012
// Updated to jQuery 1.7.x via the following plugin function filterNode() which replaces [nodeName...] syntax
// for finding node names with namespace prefixes.  This also supposedly improves performance greatly and is backward compatible.
// $(xml).find("[nodeName='ows:Title']").text(); now
// $(xml).filterNode('ows:Title').text();
// For more details see:
// http://www.steveworkman.com/html5-2/javascript/2011/improving-javascript-xml-node-finding-performance-by-2000/
//
//////////////////////////
jQuery.fn.filterNode = function(name) {
    return this.find('*').filter(function() {
        return this.nodeName === name;
     });
};
//////////////////////////
// in all these calls xml refers to a DOM object created by jQuery from the Ajax retrieved XML document.
function SOSObservation(xml)
{
    this.checkSOSType(xml);
    if(this.type === 'EXCEPTION' ){
        return;
    }
    this.members = [];
    // Since below we are using jQuery's $(this) selector this object reference is not available
    var thisObj = this;

    // loop thru all om:,member
   //  creating  Member object Member.metadata, Member.fields, Member.observations
    $(xml).filterNode('om:member').each(function() {
        var Member = new Object;
        var member_node = $(this);
        Member.metadata = parseMetadataObs(member_node, this.type)
        var Obs = parseSWEObs(member_node, Member.metadata.cf_foi_type);
        Member.fields = Obs.fields;
        Member.dc_fields = Obs.dc_fields;
        Member.observations = Obs.observations;
        Member.val_fields = Obs.val_fields;
        // HERE
        // do we need both of these? probably on need in the metadata section
        Member.dc_exists = Obs.dc_exists;
        Member.metadata.dc_exists = Obs.dc_exists;
        thisObj.members.push(Member);
     });
    //alert(this.members[0].dc_exists);

}

// returns 'SWE'  or SOS Exception's
SOSObservation.prototype.checkSOSType = function(xml){
    var root_node = $(xml).find("*");
    // Check for SOS ExceptionReport
    var tag = root_node.get(0).tagName;
    if(tag.match(/^Exception/i)){
        var code = $(xml).find("Exception").attr('exceptionCode');
        var locator = $(xml).find("Exception").attr('locator');
        var error = code + ' ' + locator + ' ' + $(xml).find("ExceptionText").text();
        this.type = 'EXCEPTION';
        this.exception_error = error;
        return;
    }
    // OOSTethys (SWE) uses ows: namespace
    if(tag.match(/^ows\:Exception/i)){
        var code = $(xml).find("ows\\:Exception").attr('exceptionCode');
        var locator = $(xml).find("ows\\:Exception").attr('locator');
        var error = code + ' ' + locator + ' ' + $(xml).find("ows\\:ExceptionText").text();
        this.type = 'EXCEPTION';
        this.exception_error = error;
        return;
    }
    // Sanity check for some type of Observation XML
    if(!tag.match(/ObservationCollection/i)){
        this.type = 'EXCEPTION';
        this.exception_error = "Unknown.  Not an SOS O&M XML response."
        return;
    }

    this.type = 'SWE';

    // we only expect one per ObservationCollection
    var node = root_node.filterNode('gml:metaDataProperty').first();
    this.md_title = node.attr('xlink:title');
    var node2 = $(node).filterNode('gml:description').first();
    this.md_disclaimer = node2.text();
}

// returns Metadata object with various properties, from the SOS GetObservation response
function parseMetadataObs(memberNode, type)
{
    var md = new Object;
    md.procedures = [];
    md.observedProperties = [];
    var arr = [];

    var node;
    var node2;

    // We CAN have mulitple observations per response
    memberNode.filterNode('om:Observation').each(function() {
        obs_node = $(this);
        md.name = obs_node.filterNode('gml:name').first().text();
        md.description = obs_node.filterNode('gml:description').first().text();
        //alert(md.name + ' ' + md.description);
        var lower = obs_node.filterNode('gml:lowerCorner').text();
        var upper = obs_node.filterNode('gml:upperCorner').text();
        arr = lower.split(' ');
        md.llat = arr.shift();
        md.llon = arr.shift();
        arr = upper.split(' ');
        md.ulat = arr.shift();
        md.ulon = arr.shift();
        md.start_time = memberNode.filterNode('gml:beginPosition').text();
        md.end_time = memberNode.filterNode('gml:endPosition').text();
        if(! md.start_time){ // SWE latest,i.e. one time uses TimeInstant
            md.start_time = memberNode.filterNode('gml:TimeInstant').text();
            md.end_time = memberNode.filterNode('gml:TimeInstant').text();
        }
        // HERE need examples with observedProperty (check some existing examples DIF and SWE)
        // we can reuse this right?
        node = obs_node.filterNode('om:observedProperty');
        if(node.children().length){
            node.filterNode('swe:component').each(function() {
            var op = $(this).attr('xlink:href');
                if(op){
                    md.observedProperties.push(op);
                }
            });
        }
	    // find platform info
        // This is from jquery.parseSOSGetObs.js and may change in new CF response
        // currently, like observedProperty set to null.
    	var node = obs_node.filterNode('om:procedure');
        if(node.children().length){
    		var sta = new Object;
    		sta.stationId = proc.attr('xlink:href');
    		sta.shortStationId = proc.attr('xlink:href').split(':').pop();
    		sta.stationName = md.name;
    		sta.stationDescription = md.description;
    		sta.lat = md.llat;
    		sta.lon = md.llon;
    		md.procedures.push(sta);
        }

        ///////////////////
        // featureOfInterest tells us what CF profile and the shape we are dealing with
        ///////////////////

        node = obs_node.filterNode('gml:FeatureCollection');
        node2 = $(node).filterNode('gml:name').first();
        md.foi_code_space = node2.attr('codeSpace');
        md.foi_cf_type = node2.text();
        node = obs_node.filterNode('gml:location').first();
        md.foi_cf_dimen = '';
        md.foi_cf_positions = [];
        var pos_str = '';
        // so far only points and trajectory
        // trajectories use posList vs pos
        if(md.foi_cf_type.match(/trajectory/i)){
            node2 = node.filterNode('gml:posList').first();
            md.foi_cf_dimen = node2.attr("srsDimension");
            pos_str = node2.text();
            // split, even with \s, still returns empty fields, so remove any leading and trailing blanks
            pos_str = pos_str.replace(/^\s+/m, "");
            pos_str = pos_str.replace(/\s+$/m, "");
            // This did not seem to work though it should
            //pos_str = pos_str.replace(/(^\s+|\s+$)/m, "");
            md.foi_cf_positions = pos_str.split(/\s+/gm);
        }else{
            //pos_str = node.filterNode('gml:pos').first().text();
            //positions = pos_str.split(/\s+/g);
            md.foi_cf_positions = node.filterNode('gml:pos').first().text().split(/\s+/g);
            md.foi_cf_dimen = 1;
        }

    });

    md.number_of_observedProperties = md.observedProperties.length;
    md.number_of_procedures = md.procedures.length;

    return md;
}

// parse OOSTethys SWE GetObservation response. Uses jQuery's filterNode() plugin filterNode('xxxx']).each method.
// returns SOSGetObs object with two property arrays. fields[] and observations[]
// fld Object { name: xxx  , uom: xxx, definition: xxx, global_value: xxxx or '' }
// any of these except name could be null
// obs Object { fld1: xxx  , fld2: xxx, fld3: xxx } same number of properties as the number of fields

function dataChoiceFld(dc_choices){
    var fldObj = new Object;
    fldObj.fld_name = 'swe:DataChoice';
    fldObj.name = 'swe:DataChoice';
    fldObj.dc_choices = dc_choices;
    fldObj.global_value = [];

    return fldObj;
}
function parseFldCategory(node, fld_name)
{
    var fldObj = new Object;
    fldObj.quality = null;
    fldObj.global_value = [];
    fldObj.fld_name = fld_name;
    fldObj.name = fld_name;
    fldObj.definition = node.attr("definition");
    // HERE
//    if(fldObj.definition.match("/")){
//        fldObj.name = fldObj.definition.split('/').pop();
//    }else{
//        fldObj.name = fldObj.definition.split(' ').pop();
//    }

    fldObj.uom = node.filterNode('swe:codeSpace').first().attr("xlink:href");
    fldObj.label = node.filterNode('swe:label').text();

    // HERE may need search for global values?
    return fldObj;
}

function parseFldQuantity(node, fld_name)
{
    var fldObj = new Object;
    fldObj.quality = null;
    fldObj.global_value = [];
    fldObj.fld_name = fld_name;
    fldObj.name = fld_name;

    fldObj.definition = node.attr("definition");
// HERE
//    fldObj.name = fldObj.definition.split('/').pop();
    fldObj.uom = node.filterNode('swe:uom').first().attr("code");
    // This seems to be working
    // Wait to check and set global_value, since both Quanity and quality can have swe:values
    // So check all children and check for quality or swe:value

    node.children().each(function(){
        var chld_node = $(this);
        if( chld_node.get(0).tagName == 'swe:quality'){
            var qualObj = new Object;
            qualObj.uom = chld_node.filterNode('swe:uom').attr("code");
            qualObj.definition = chld_node.filterNode('swe:Quantity').attr("definition");
            // HERE
            //qualObj.name = qualObj.definition.split('/').pop();
            qualObj.label = chld_node.filterNode('swe:label').text();
            qualObj.name = chld_node.filterNode('swe:label').text();
            qualObj.fld_name = chld_node.filterNode('swe:label').text();
            var tmp = chld_node.filterNode('swe:value').text();
            if(tmp){
                qualObj.global_value = tmp;
            }

            fldObj.quality = qualObj;
        }else if( chld_node.get(0).tagName == 'swe:value'){
            var tmp = chld_node.text();
            if(tmp){
                //qualObj.global_value.push(tmp);
                fldObj.global_value.push(tmp);
            }
        }
    });
    return fldObj;
}

function parseFldTime(node, fld_name)
{
    var fldObj = new Object;
    fldObj.fld_name = fld_name;
    fldObj.name = fld_name;
    fldObj.global_value = [];

    fldObj.definition = node.attr("definition");
//    fldObj.name = fldObj.definition.split('/').pop();
    fldObj.uom = node.filterNode('swe:uom').attr("xlink:href");
    // check for null or empty values
    var tmp = node.filterNode('swe:value').text();
    if(tmp){
        fldObj.global_value.push(tmp);
    }
    return fldObj;
}

function parseFldVector(node, fld_name)
{
    var flds =[];
    node.filterNode('swe:coordinate').each(function() {
        var coord_node = $(this);
        var coord_name = coord_node.attr("name");
        //alert(coord_name);
        var quant = coord_node.children(":first");
        var fldObj = parseFldQuantity(quant, coord_name);  
        flds.push(fldObj);
   }); // end eadh swe:Vector/swe:Quantity
    return flds;
}

// HERE O.K.  This seems to be parsing the template/timeSeriesProfile.xml very well.
// Need to check and add other possible members, see the main loop.
// Are DataRecord, Time, Vector and Quanity the only primitives?
// Need to clean up the main loop and then think about how to handle DataChoice (see cf_jquery.parseSOSObs.js.sav)
// Or just declare DataChoice impossible, too difficult ;-)
// O.K.  Try CO-OPS/Currents_point_latest.xml  Missing time field for some reason 
// FIXED. Was forgetting to push field/swe:Time into flds.
// So CO-OPS need to figure out bin_distance and Quality flags, etc.
// BUT FIRST make sure all is cleaned up (except DataChoice) and test all the basic templates types
// And figure out basic HTML display.
// 1. global_value is now an array, make sure we add all that exists, e.g. bin_height's.  What about labels? That logic seems flawed.
//  Note:  cf_type is not yet used
function parseFldDataRecord(node, cf_type)
{
    var flds = [];
    var sub_flds = [];
    node.children().each(function(){
        var chld_node = $(this);
        var cn_tag = chld_node.children(":first").get(0).tagName;
        var cn_chld = chld_node.children(":first");
        //alert('DR children: ' + cn_tag);
        if(cn_tag == 'swe:Time'){
            var fldObj = parseFldTime(cn_chld, chld_node.attr("name"));
            flds.push(fldObj);
         }
        if(cn_tag == 'swe:DataArray'){
            var da_tag = cn_chld.children(":first").get(0).tagName;
            var da_chld = cn_chld.children(":first");
            sub_flds = [];
            v_flds = parseFldDataRecord(da_chld, cf_type);
            for(var j = 0; j < v_flds.length; j++){
                flds.push(v_flds[j]);
            }
            //alert('Internal v_flds length: ' + v_flds.length);
        }
        if(cn_tag == 'swe:Vector'){
            //alert('Vector name: ' + chld_node.attr("name"));
            sub_flds = [];
            v_flds = parseFldVector(cn_chld, chld_node.attr("name"));
            for(var j = 0; j < v_flds.length; j++){
                flds.push(v_flds[j]);
            }
        }
        if(cn_tag == 'swe:Category'){
            var fldObj = parseFldCategory(cn_chld, chld_node.attr("name"));  
            flds.push(fldObj);
        }
        if(cn_tag == 'swe:Quantity'){
            //alert('field/Quanity name: ' + chld_node.attr("name"));  
            var fldObj = parseFldQuantity(cn_chld, chld_node.attr("name"));  
            flds.push(fldObj);
        }
    });

    return flds;
}

// New Approach
// HERE
// cf_type: point, profile, timeSeries, timeSeriesProfile (not trajectory yet)
function parseSWEObs(memberNode, cf_type)
{
    SOSGetObs = new Object;
    var flds = [];
    var val_flds = [];
    var obs = [];
    var block_sep = '';
    var token_sep = '';

    // DataChoice in fields definition
    var dc_flds = new Object;
    SOSGetObs.dc_exists = false;

    // We CAN HAVE multiple om:Observation within an om:ObservationCollection
    // the caller SOSObservation is handling this, so memberNode is an om:member, each with own cf_type
    var result = memberNode.filterNode('swe:DataStream');

// THIS WORKS HERE but we didn't need it
//  var has_dr = false;
//  result.filterNode('swe:DataRecord').each(function() {
//      has_dr = true;
//  });
//  alert(has_dr);

////////////// each child of the DataStream
    result.children().each(function(){
        var chld = $(this);

        // So get(0) is need to access the element name or tagName but cannot be used if you want the actual node
        // This childs element name
        var tag = chld.get(0).tagName;
        // This childs name attribute
        var fld_name = chld.attr("name");
        // Skip value tuples for now. We need the field info to parse them correctly
        if(tag === 'swe:values'){
            // return true in jQuery.each() continues the each loop
            return true;
        }
        // set the text encoding values then next
        if(tag === 'swe:encoding'){
            var enc_node = chld.filterNode('swe:TextEncoding');
            block_sep = enc_node.attr("blockSeparator");
            token_sep = enc_node.attr("tokenSeparator");
            return true;
        }
        //alert(tag + ' ' + fld_name);
        //////////////////////////
        // timeSeriesProfile has this extra DataRecord, not sure why
        if(tag === 'swe:DataRecord'){
            var v_flds = parseFldDataRecord(chld, cf_type);
            //alert('v_flds length: ' + v_flds.length);
            for(var j = 0; j < v_flds.length; j++){
                flds.push(v_flds[j]);
            }
        }
        // SWE:FIELD
        // this is most like the pure CSV approach of OOSTethys, with small variations for global values
        // with swe:Time, swe:Vector holds  lat,lon,altitude, and  swe:Quantity for observed values
        //////////////////////////
        // swe:field this is most like the pure CSV approach of OOSTethys, with small variations for global values
        if(tag === 'swe:field'){
            var chld_tag = chld.children(":first").get(0).tagName;
            var fld_chld = chld.children(":first");

            // CO-OPS point with quality flags
            // HERE
            if(chld_tag === 'swe:DataRecord'){
                var v_flds = parseFldDataRecord(fld_chld, cf_type);
                for(var j = 0; j < v_flds.length; j++){
                    flds.push(v_flds[j]);
                }
            }


            // HERE this is for NDBC/swe_wave_sample.xml Still under discussion
            if(chld_tag === 'swe:DataArray'){
                var da_chld_tag = fld_chld.children(":first").get(0).tagName;
                var da_chld = fld_chld.children(":first");
                //alert(da_chld_tag);
                var v_flds = parseFldDataRecord(da_chld, cf_type);
                for(var j = 0; j < v_flds.length; j++){
                    //alert(v_flds[j].name);
                    flds.push(v_flds[j]);
                 }
            }

            // time field
            if(chld_tag  === 'swe:Time'){
               var fldObj = parseFldTime(fld_chld, fld_name);
               // HERE
               //alert("GV length: " + fldObj.global_value.length);
               flds.push(fldObj);
            }
            // location field
            if(chld_tag  === 'swe:Vector'){
                var v_flds = parseFldVector(fld_chld, fld_name);
                for(var j = 0; j < v_flds.length; j++){
                    flds.push(v_flds[j]);
                }
            }
            if( chld_tag  === 'swe:Quantity'){
                var fldObj = parseFldQuantity(fld_chld, fld_name);  
                if(fldObj.quality){
                    //alert(fldObj.quality.name);
                }
                flds.push(fldObj);
            }
        }
    }); // end each result (DataStream) children

////////////// END each child of the DataStream

    //alert(SOSGetObs.dc_exists);

    // val_flds are the fields which have no global values and are parsed from the tuple
    // HERE Hmmmm. perhaps we need to just use the tuples to set global_value[0]???

    // HERE seems crazy but need check on whether we got any val_flds
    for(var j = 0; j < flds.length; j++){
        var this_fld = flds[j];
        if( this_fld.global_value.length === 0){
            val_flds.push(this_fld);
        }
    }
    //alert('val flds: ' + val_flds.length);
//    for(var i = 0; i < val_flds.length; i++){
//        alert(val_flds[i].name);
//    }
    var values = result.filterNode('swe:values').text();
    values = values.replace(/^\s+/m, "");
    values = values.replace(/\s+$/m, "");
    var block_re = new RegExp(block_sep);
    var token_re = new RegExp(token_sep);
    //alert('-' + block_sep + '-');
    // this doesn't work
    //var tuples = values.split(/block_sep/);

    var tuples = values.split(block_re);
    //alert('tuple count: ' + tuples.length);
    // 
    for(var i = 0; i < tuples.length; i++){
        var vals = tuples[i].split(token_re);
        //alert('vals len: ' + vals.length);
        var obsObj = new Object;
        obsObj.vals = [];
        for(var j = 0; j < vals.length; j++){
			//alert(j + ': ' + vals[j]);
            obsObj.index = j;
            obsObj.vals.push(vals[j]);
       } // end vals loop
       obs.push(obsObj);
   }

    SOSGetObs.fields = flds;
    SOSGetObs.observations = obs;
    SOSGetObs.val_fields = val_flds;
    SOSGetObs.dc_fields = dc_flds;

    return(SOSGetObs);

} // end parseSWEObs


///////////////////////////
/// Some utility output formats. Should wrap all these into an Object at some point
////////////////////////////
SOSObservation.prototype.metadataHTML = function ()
{
    var html = '<b>Observation Collection Metadata</b><br />';
    html += this.md_title + ': ' + this.md_disclaimer + '<br />';

    for (var j = 0; j < this.members.length; j++){

        var metadata = this.members[j].metadata;

        html += '<table cellpadding="4" border="1">';
        for( var name in metadata){
            if(name === 'procedures' || name === 'observedProperties'){
                continue;
            }
            html += '<tr><td><b>' + [name] + '</b></td><td>' + metadata[name] + '</td></tr>';
        }
        html += '<tr><td colspan="2">observedProperties</td></tr>';
        for (var i = 0; i < metadata.observedProperties.length; i++){
                html += '<tr><td><b>observedProperty</b></td><td>' + metadata.observedProperties[i] + '</td></tr>';
        }
        html += '<tr><td colspan="2">procedures</td></tr>';
        for (var i = 0; i < metadata.procedures.length; i++){
            var platform = metadata.procedures[i];
            for(var plat in platform){
                html += '<tr><td><b>' + [plat] + '</b></td><td>' + platform[plat] + '</td></tr>';
            }
            if(metadata.procedures.length > 1){
                html += '<tr><td colspan="2" bgcolor="yellow"></td></tr>';
            }
        }
        html += '</table>';
        html += '<hr>';

    } // end for this.members

    return html;
}

SOSObservation.prototype.obsHTML = function()
{
    var final_html = '';
    for (var j = 0; j < this.members.length; j++){
        var fields = this.members[j].fields;
        var global_html = '<b>Globals</b> for ' + this.members[j].metadata.name + '<br />';
        global_html += '<table cellpadding="4" border="1">';
        for(var i = 0; i < fields.length; i++){
            var fld = fields[i];
            if(fld.global_value.length !== 0){
                if(fld.uom){
                    global_html += '<tr><td><b>' + fld.name + '</b> (' + fld.uom + ')</td>';
                }else{
                    global_html += '<tr><td><b>' + fld.name + '</b></td>';
                }
                global_html += '<td>' + fld.global_value.join(',') + '</td></tr>';
            }
           if(fld.quality && fld.quality.global_value){
                global_html += '<tr><td>' + fld.name + '</td><td><b>Quality</b></td></tr>';
                global_html += '<tr><td>' + fld.quality.name +  '</td>';
                global_html += '<td>definition: ' + fld.quality.definition + '<br />';
                global_html += 'label: ' + fld.quality.label + '<br />';;
                global_html += 'uom: ' + fld.quality.uom + '<br />value: ' + fld.quality.global_value;
                global_html += '</td></tr>';
           }
        }
        global_html += '</table>';

        var html = '<b>Values</b><br />';
        var val_fields = this.members[j].val_fields;

        html += '<table cellpadding="4" border="1">';
        // Member.val_fields
        // val_fields is an array of fld Objects
        // any of these except name could be null
        html += '<tr>';  // begin header row
        for(var i = 0; i < val_fields.length; i++){
            var fld = val_fields[i];
            if(fld.uom){
                html += '<th>' + fld.name + ' (' + fld.uom + ')</th>';
            }else{
                html += '<th>' + fld.name + '</th>';
            }
        }

        html += '</tr>';  // end header row

        var observations = this.members[j].observations;
        // HERE observations array has changed
        // Member.observations is an array of obs Objects
        // obs Object { fld1: xxx  , fld2: xxx, fld3: xxx } same number as number of flds
        //alert('obs len: ' + observations.length);
        for(var i = 0; i < observations.length; i++){
            html += '<tr>';
            var obs = observations[i];
            for (var k = 0; k < obs.vals.length; k++ ){
                html += '<td>' + obs.vals[k] + '</td>';
            }
            html += '</tr>';
        }
        html += '</table><hr>';
        final_html += global_html +  html;
    
    } // for this.members[j]

    return( final_html);
}
