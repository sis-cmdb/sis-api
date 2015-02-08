'use strict';



process.on("message", function(msg) {
    var type = msg.type;
    var data = msg.data;
    if (type === "request") {
	var req = data;
	var res = {
	    status : 200,
	    data: JSON.stringify(req),
	    mime : "application/json"
	};
	process.send({
	    type : "done",
	    data : res
	});
    }
});

process.send({ type : "ready" });
