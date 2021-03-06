'use strict';

const React = require("react");
const icons = require('../components/icons.js');
const sanitize = require('sanitize-html');

module.exports = {
  asText: function(event) {
    //if (event.content == undefined ||
    //  (event.content.membership == undefined &&
    //    event.content.msgtype == undefined && event.type != "m.sticker")) {
    //  //console.log(event);
    //  //return "please open an issue at github.com/f0x52/neo/issues, full event in console";
    //  return null;
    //}

    if (event.reply && event.content.formatted_body != undefined) {
      let endOfReplyIndex = event.content.formatted_body.indexOf("</mx-reply>") + 11;
      event.content.body = event.content.formatted_body.substr(endOfReplyIndex);
    }

    if (event.type == "m.room.message") {
      let type = "";
      if (event.content.msgtype == "m.notice") {
        type = icons.notice;
      } else if (event.content.msgtype == "m.emote") {
        type = <React.Fragment>{icons.action} {event.sender} </React.Fragment>;
      } else if (event.content.msgtype == "m.image") {
        type = icons.image;
      } else if (event.content.msgtype == "m.video") {
        type = icons.video;
      } else if (event.content.msgtype == "m.file") {
        type = icons.file;
      } else if (event.content.msgtype == "m.location") {
        type = "[location]";
      } else if (event.content.msgtype == "m.audio") {
        type = "[audio]";
      }
      if (event.content.formatted_body != undefined) {
        let saneBody = sanitize(event.content.formatted_body, {allowedTags: ['mx-reply']});
        return <span>{type} <span dangerouslySetInnerHTML={{ __html: saneBody}} /></span>;
      }
      return <span>{type} {event.content.body}</span>;
    } else if (event.type == "m.sticker") {
      if (event.content.body == undefined) {
        return <span>Sticker</span>;
      }

      let bodyParts = event.content.body.split(" ");
      let emoji = bodyParts[0];
      return <span>{emoji} Sticker</span>;
    } else if (event.type == "m.room.member") {
      let action = "";
      let reason = "";
      if (event.content.membership) {
        event.membership = event.content.membership;
      }
      if (event.membership == "leave") {
        if (event.sender == event.state_key) { //leave
          action = "left";
        } else { //kick
          action = "kicked " + event.state_key;
        }
      } else if (event.membership == "join") {
        action = "joined";
      } else if (event.membership == "invite") {
        action = "invited " + event.state_key;
      } else if (event.membership == "ban") {
        action = "banned " + event.state_key;
      } 
      else {
        action = "did something, please open an issue at github.com/f0x52/neo/issues, full event in console";
        console.log(event);
      }

      if (event.content.reason != undefined) {
        reason = "reason: " + event.content.reason;
      }
      return (`${event.sender} ${action} ${reason}`);
    } else if (event.type == "m.sticker") { // for the future, not needed with current hack
      let bodyParts = event.content.body.split(" ");
      let emoji = bodyParts[0];
      return <span>{emoji} Sticker</span>;
    } else if (event.type == "m.room.topic") {
      return (`${event.sender} changed topic to ${event.content.topic}`);
    }

    return null;
  }
};

