import React from 'react';
import ReactDOM from 'react-dom';
import Linkify from 'react-linkify';

import '../scss/layout.scss';

let riot = require('./riot-utils.js');
let create = require('create-react-class');
let neo = require('../assets/neo_full.png');
let blank = require('../assets/blank.jpg');
let loadingGif = require('../assets/loading.gif');
let uniq = require('arr-uniq');
let homeserver = "https://matrix.org";

let icon = {
  file: {
    dark: require('../assets/dark/file.svg'),
    light: require('../assets/light/file.svg')
  },
  send: {
    dark: require('../assets/dark/send.svg'),
    light: require('../assets/light/send.svg')
  }
}

let App = create({
  displayName: "App",
  getInitialState: function() {
    let loginJson = {};
    if(localStorage.getItem("loginJson")) {
      loginJson = JSON.parse(localStorage.getItem("loginJson"));
      this.timer = setInterval(
        () => this.sync(),
        2000
      )
      console.log("loaded loginJson from storage");
    }
    return({
      loginJson: loginJson,
      json: {rooms:{join:{}}},
      rooms: [],
      messages: [],
      loading: 0,
      syncing: 0,
      room: 0,
      backlog: 0
    });
  },

  setJson: function(json) {
    this.setState({loginJson: json});
    localStorage.setItem("loginJson", JSON.stringify(json));
    if (json.access_token) {
      this.timer = setInterval(
        () => this.sync(),
        2000
      )
    }
  },

  setLoading: function(loading) {
    this.setState({loading: loading});
  },

  setRoom: function(room) {
    this.setState({room: room});
  },

  componentWillUnmount: function() {
    if (this.timer != undefined) {
      clearInterval(this.timer);
    }
  },

  sync: function() {
    if (this.state.syncing) {
      return;
    }
    this.setLoading(1);
    this.setState({syncing: 1});
    let url = homeserver + 
      "/_matrix/client/r0/sync?timeout=30000&access_token=" + 
      this.state.loginJson.access_token;
    if(this.state.json.next_batch != undefined) {
      url = url + "&since=" + this.state.json.next_batch;
    }
    fetch(url)
      .then((response) => response.json())
      .catch(error => console.error('Error:', error))
      .then((responseJson) => {
        if (responseJson == undefined) {
          return;
        }
        let rooms = responseJson.rooms.join;
        let roomsState = this.state.rooms;
        let messages = this.state.messages;
        for(let roomid in rooms) {
          let events = rooms[roomid].timeline.events;
          if (messages[roomid] != undefined) {
            for (let event in events) {
              messages[roomid].push(events[event]);
            }
          } else {
            messages[roomid] = events;
          }
          messages[roomid].sort(sortEvents);
          messages[roomid] = uniq(messages[roomid], uniqEvents);
          roomsState[roomid] = messages[roomid][messages[roomid].length - 1];
          roomsState[roomid].prev_batch = rooms[roomid].timeline.prev_batch;
          for (let i=messages[roomid].length - 1; i>0; i--) {
            //Try get the last message with text content
            if(messages[roomid][i].content.body != undefined) {
              roomsState[roomid].lastmessage = messages[roomid][i].content.body;
              roomsState[roomid].origin_server_ts = messages[roomid][i].origin_server_ts;
              break;
            }
          }
        }
        this.setState({
          messages: messages,
          json: responseJson,
          rooms: roomsState
        });
        this.setLoading(0);
        this.setState({syncing: 0});
    });
  },

  getBacklog: function(roomid) {
    if (this.state.backlog == 1) {
      return;
    }
    this.setState({backlog: 1});
    let messages = this.state.messages;
    let rooms = this.state.rooms;
    let from = rooms[roomid].prev_batch;

    let url = homeserver + 
      "/_matrix/client/r0/rooms/" + roomid +
      "/messages?from=" + from +
      "&limit=50" +
      "&dir=b" +
      "&access_token=" + 
      this.state.loginJson.access_token;

    fetch(url)
      .then((response) => response.json())
      .catch(error => console.error('Error:', error))
      .then((responseJson) => {
        if (messages[roomid] != undefined) {
          for (let event in responseJson.chunk) {
            messages[roomid].push(responseJson.chunk[event]);
          }
        } else {
          messages[roomid] = responseJson.chunk;
        }
        messages[roomid].sort(sortEvents);
        messages[roomid] = uniq(messages[roomid], uniqEvents);
        rooms[roomid].prev_batch = responseJson.end;
        this.setState({
          messages: messages,
          rooms: rooms,
          backlog: 0
        });
      })
  },

  render: function() {
    let loading;
    if (this.state.loading) {
      loading = <img className="loading" src={loadingGif} alt="loading"/>
    }
    if (!this.state.loginJson.access_token) {
      return (
        <div className="login">
          {loading}
          <Login setJson={this.setJson} setLoading={this.setLoading}/>
        </div>
      );
    }
    return (
      <div className="main">
        <div>{loading}</div>
        <List
          room={this.state.room}
          rooms={this.state.rooms}
          json={this.state.json}
          token={this.state.loginJson.access_token}
          setRoom={this.setRoom}
        />
        <div className="view">
          <div className="messages" id="message_window">
            <Messages
              backlog={this.getBacklog}
              messages={this.state.messages[this.state.room]}
              json={this.state.json}
              token={this.state.loginJson.access_token}
              room={this.state.room}
              user={this.state.loginJson.user_id}
            />
          </div>
          <div className="input">
            <label htmlFor="attachment">
              <img src={icon.file.dark} id="file" className="dark"/>
              <img src={icon.file.light} id="file" className="light"/>
            </label>
            <Attachment
              room={this.state.room}
              token={this.state.loginJson.access_token}
            />
            <Send
              room={this.state.room}
              token={this.state.loginJson.access_token}
            />
            <img src={icon.send.dark} id="send" className="dark"/>
            <img src={icon.send.light} id="send" className="light"/>
          </div>
        </div>
      </div>
    );
  }
})

let observe = function (element, event, handler) {
  element.addEventListener(event, handler, false)
}

let Send = create({
  displayName: "Send",
  componentDidMount: function() {
    let textarea = document.getElementById('text')
    observe(textarea, 'change',  this.resize_textarea);
    observe(textarea, 'cut',     this.resize_textarea_delayed);
    observe(textarea, 'paste',   this.resize_textarea_delayed);
    observe(textarea, 'drop',    this.resize_textarea_delayed);
    observe(textarea, 'keydown', this.resize_textarea_delayed);
    observe(textarea, 'keydown', this.shift_enter);

    observe(document.getElementById('send'), 'click', this.send);
  },

  shift_enter: function(event) {
    if (event.keyCode == 13 && !event.shiftKey) {
      event.preventDefault();
      this.send()
    }
  },

  resize_textarea: function() {
    let textarea = document.getElementById('text')
    textarea.style.height = 'auto'
    textarea.style.height = text.scrollHeight+'px'
  },

  resize_textarea_delayed: function() {
    window.setTimeout(this.resize_textarea, 5);
  },

  send: function() {
    let textarea = document.getElementById('text')
    if(textarea.value != "") {
        let msg = textarea.value.replace(/^\s+|\s+$/g, '')
        textarea.value = ""
        let unixtime = Date.now()

        let url = homeserver +
        "/_matrix/client/r0/rooms/" +
        this.props.room +
        "/send/m.room.message/" +
        unixtime +
        "?access_token=" +
        this.props.token

        let body = {
          "msgtype": "m.text",
          "body": msg,
        }

        fetch(url, {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: new Headers({
            'Content-Type': 'application/json'
          })
        }).then(res => res.json())
        .catch(error => console.error('Error:', error))
        .then(response => console.log('Success:', response));
    }
    textarea.value = "";
    this.resize_textarea();
  },

  render: function() {
    return (
      <textarea
        id="text"
        rows="1"
        placeholder="Write a message..."
        spellCheck="false">
      </textarea>
    );
  }
})

let Attachment = create ({
  displayName: "Attachment",
  componentDidMount: function() {
    document.getElementById("attachment").addEventListener('change', this.upload, false);
  },

  upload: function() {
    let file = document.getElementById("attachment").files[0];
    this.setState({file: file});
    let upload_url = homeserver +
      "/_matrix/media/r0/upload" +
      "?access_token=" + this.props.token
    fetch(upload_url, {
      method: 'POST',
      body: this.state.file,
    }).then(
      response => response.json()
    ).then(response => {
      console.log('Success:', response)
      this.setState({"url": response.content_uri});
      
      let unixtime = Date.now()

      let msg_url = homeserver +
      "/_matrix/client/r0/rooms/" +
      this.props.room +
      "/send/m.room.message/" +
      unixtime +
      "?access_token=" +
      this.props.token;

      if (this.state.file.type.startsWith("image/")) { //image, so create a thumbnail as well
        let thumbnailType = "image/png";
        let imageInfo;

        if (this.state.file.type == "image/jpeg") {
            thumbnailType = "image/jpeg";
        }

        riot.loadImageElement(this.state.file).bind(this).then(function(img) {
          return riot.createThumbnail(img,
            img.width,
            img.height,
            thumbnailType);
        }).then(function(result) {
          imageInfo = result.info;
          this.setState({"info": imageInfo});
          fetch(upload_url, {
            method: 'POST',
            body: result.thumbnail,
          }).then(
            response => response.json()
          ).then(response => {
            let info = this.state.info;
            info.thumbnail_url = response.content_uri;
            info.mimetype = this.state.file.type;

            let body = { 
              "msgtype": "m.image",
              "url": this.state.url,
              "body": this.state.file.name,
              "info": info
            }

            fetch(msg_url, {
              method: 'PUT',
              body: JSON.stringify(body),
              headers: new Headers({
                'Content-Type': 'application/json'
              })
            }).then(res => res.json())
            .catch(error => console.error('Error:', error))
            .then(response => console.log('Success:', response));
        })});
      } else {
        let body = { 
          "msgtype": "m.file",
          "url": response.content_uri,
          "body": this.state.file.name,
          "info": {
            "mimetype": this.state.file.type
          }
        }

        fetch(msg_url, {
          method: 'PUT',
          body: JSON.stringify(body),
          headers: new Headers({
            'Content-Type': 'application/json'
          })
        }).then(res => res.json())
        .catch(error => console.error('Error:', error))
        .then(response => console.log('Success:', response));
      }
    });
  },

  render: function() {
    return (
      <input id="attachment" type="file"/>
    )
  }
})

let Login = create({
  displayName: "Login",
  getInitialState: function() {
    return ({
      user: "",
      pass: "",
      error: undefined,
      json: {},
    });
  },

  render: function() {
    let error;
    if (this.state.json.error != undefined) {
      error = <span id="error" className="red">{this.state.json.error}</span>
    }
    return (
      <center>
          <img id="header" src={neo}/>
          <form id="login">
            <input id="user" type="text" placeholder="username"
              value={this.state.user} onChange={this.handleUser}/><br/>
            <input id="pass" type="password" placeholder="password"
              value={this.state.pass} onChange={this.handlePass}/><br/>
            <button type="submit" onClick={this.login}>Log in</button>
          </form>
          {error}
        </center>
    );
  },

  handleUser: function(event) {
    this.setState({user: event.target.value});
  },

  handlePass: function(event) {
    this.setState({pass: event.target.value});
  },

  login: function(event) {
    event.preventDefault();
    this.props.setLoading(1);
    let data = {
      "user": this.state.user,
      "password": this.state.pass,
      "type": "m.login.password",
      "initial_device_display_name": "Neo Webclient",
    };
    fetch(homeserver + "/_matrix/client/r0/login", {
      body: JSON.stringify(data),
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST',
    })
    .then((response) => response.json())
    .then((responseJson) => {
      this.setState({json: responseJson});
      if(responseJson.access_token != undefined) {
        this.props.setJson(responseJson);
      }
      this.props.setLoading(0);
    });
  }
})

let List = create({
  displayName: "List",
  render: function() {
    let rooms = this.props.rooms;
    let sortedRooms = Object.keys(rooms).sort(
      function(a, b) {
        return rooms[b].origin_server_ts - rooms[a].origin_server_ts;
      }
    );
    let list = sortedRooms.map((roomid) => 
      <RoomEntry
        lastEvent={rooms[roomid]}
        active={this.props.room == roomid}
        key={roomid}
        id={roomid}
        token={this.props.token}
        setRoom={this.props.setRoom}
      />
    );
    return(
      <div className="list no-select" id="list">
        {list}
      </div>
    );
  },
})

let RoomEntry = create({
  displayName: "RoomEntry",
  getInitialState: function() {
    return ({
      name: this.props.id,
      img: blank,
    });
  },

  componentDidMount: function() {
    let url = homeserver +
      "/_matrix/client/r0/rooms/" +
      this.props.id +
      "/state/m.room.name?access_token=" +
      this.props.token;
    fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.name != undefined) {
          this.setState({name: responseJson.name});
        }
      })

    url = homeserver +
      "/_matrix/client/r0/rooms/" +
      this.props.id +
      "/state/m.room.avatar?access_token=" +
      this.props.token;
    fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if(responseJson.errcode == undefined) {
          this.setState({
            img: homeserver +
            "/_matrix/media/r0/download/" +
            responseJson.url.substring(6)
          });
        }
      })
  },

  render: function() {
    let time = new Date(this.props.lastEvent.origin_server_ts);
    let now = new Date();
    let time_string;
    if (time.toDateString() == now.toDateString()) {
      time_string = time.getHours().toString().padStart(2, "0") +
        ":" + time.getMinutes().toString().padStart(2, "0");
    } else {
      time_string = time.getMonth().toString().padStart(2, "0") +
        "." + time.getDay().toString().padStart(2, "0") +
        "." + time.getFullYear();
    }
    return (
      <div
        id="room_item"
        className={this.props.active ? "active" : ""}
        onClick={() => this.props.setRoom(this.props.id)}>
        <img
          height="70px"
          width="70px"
          src={this.state.img}
          onError={(e)=>{e.target.src = blank}}
        />
        <span id="name">
          {this.state.name}
        </span><br/>
        <span className="timestamp">
          {time_string}
        </span>
        <span className="last_msg">
          {this.props.lastEvent.lastmessage}
        </span>
      </div>
    );
  }
})

let Messages = create({
  displayName: "Messages",
  getInitialState: function() {
    return({
      userinfo: []
    })
  },

  componentWillUpdate: function() {
    var node = ReactDOM.findDOMNode(this);
    if (node != null) {
      this.shouldScrollBottom = node.scrollTop + node.offsetHeight === node.scrollHeight;
    }
  },
   
  componentDidUpdate: function() {
    if (this.shouldScrollBottom) {
      var node = ReactDOM.findDOMNode(this);
      node.scrollTop = node.scrollHeight
    }
  },

  get_userinfo: function(id) {
    let token = this.props.token;
    let userinfo = this.state.userinfo;
    userinfo[id] = {};
    userinfo[id].name = id;
    userinfo[id].img  = blank;
    this.setState({userinfo: userinfo});

    let url = homeserver +
      "/_matrix/client/r0/profile/" +
      id +
      "/displayname?access_token=" +
      token;
    this.nameFetch = fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.displayname != undefined) {
          userinfo = this.state.userinfo;
          userinfo[id].name = responseJson.displayname;
          this.setState({userinfo: userinfo});
        }
      })

    this.imgFetch = url = homeserver +
      "/_matrix/client/r0/profile/" +
      id +
      "/avatar_url?access_token=" +
      token;
    fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if(responseJson.errcode == undefined &&
          responseJson.avatar_url != undefined) {
          userinfo = this.state.userinfo;
          userinfo[id].img = homeserver +
            "/_matrix/media/r0/thumbnail/" +
            responseJson.avatar_url.substring(6) +
            "?width=64&height=64";
          this.setState({userinfo: userinfo});
        }
      })
  },

  render: function() {
    if (this.props.room == 0 || this.props.messages == undefined) {
      return null;
    }
    let messages = Object.keys(this.props.messages).map((event_num) => {
      let event = this.props.messages[event_num];
      let next_event = parseInt(event_num)+1;

      if (event.grouped != 1 && event.type == "m.room.message") {
        if (this.state.userinfo[event.sender] == undefined) {
          this.get_userinfo(event.sender);
        }

        while (this.props.messages[next_event] != undefined &&
          this.props.messages[next_event].sender == event.sender &&
          this.props.messages[next_event].type == "m.room.message" &&
          (this.props.messages[next_event].content.msgtype == "m.text" ||
            this.props.messages[next_event].content.msgtype == "m.notice" ) &&
          (this.props.messages[next_event].origin_server_ts -
            event.origin_server_ts < 300000) && //max 5 min older
          this.props.messages[next_event].grouped != 1) {
          this.props.messages[next_event].grouped = 1;
          event.content.body += "\n" + this.props.messages[next_event].content.body;
          next_event++;
        }

        return (
          <Message
            key={event.event_id}
            info={this.state.userinfo[event.sender]}
            id={event.sender}
            event={event}
            source={event.sender == this.props.user ? "out" : "in"}
            group="no"
          />
        )
      } else if (event.type == "m.room.member") {
        return (
          <div className="line member" key={event.event_id}>
            {event.sender}
            {event.membership == "leave" && " left" || " joined" }
          </div>
        )
      }
    }
    );
    return (
      <div>
        <span onClick={() => this.props.backlog(this.props.room)}>
          Load more messages
        </span><br/>
        {this.props.room}
        {messages}
      </div>
    )
  }

})

let Message = create({
  displayName: "Message",
  render: function() {
    let classArray = ["message", this.props.id, this.props.source].join(" ");
    let time = new Date(this.props.event.origin_server_ts)
    let time_string = time.getHours().toString().padStart(2, "0") +
      ":" + time.getMinutes().toString().padStart(2, "0");

    let media = "";
    let media_width = "";
    if (this.props.event.content.msgtype == "m.image" || this.props.event.content.msgtype == "m.video") {
      classArray += " media";
      if (this.props.event.content.info == undefined ||
          this.props.event.content.info.thumbnail_info == undefined) {
        media = <a href={m_download(this.props.event.content.url)}><span>no thumbnail available</span></a>
      } else {
        media_width = this.props.event.content.info.thumbnail_info.w;
        if (this.props.event.content.msgtype == "m.image") {
          let media_url = this.props.event.content.info.thumbnail_url;
          if (this.props.event.content.info.mimetype == "image/gif") {
            media_url = this.props.event.content.url;
          }
          media = (
            <div>
              <a href={m_download(this.props.event.content.url)}>
                <img
                  src={m_download(media_url)}
                />
              </a>
            </div>
          );
        } else {
          media = <video
              src={m_download(this.props.event.content.url)}
              poster={m_download(this.props.event.content.info.thumbnail_url)}
              controls
              preload="none"
            ></video>;
        }
      }
    } else if (this.props.event.content.msgtype == "m.file") {
      media = <a
        className="file"
        href={m_download(this.props.event.content.url)}
      >
        <span>file download</span>
      </a>
    } else {
      if (!this.props.event.content.msgtype == "m.text") {
        console.log(this.props.event);
      }
    }

    if (this.props.event.content.body == undefined) {
      return null;
    }

    return (
      <div className="line">
        <img id="avatar" src={this.props.info.img} onError={(e)=>{e.target.src = blank}}/>
        <div className={classArray} id={this.props.id} style={{width: media_width}}>
          <div>
            <b>{this.props.info.name}</b>
            {media}
            <div className="flex">
              <p><Linkify component={MaybeAnImage}>{
                this.props.event.content.body.split('\n').map((item, key) => {
                  return <span key={key}>{item}<br/></span>
                })
              }</Linkify></p>
              <span className="timestamp">{time_string}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
})

let MaybeAnImage = create({
  getInitialState: function() {
    return {img: "no"}
  },

  componentDidMount: function() {
    let img = new Image();
    img.onload = () => this.setState({img: "yes"});
    img.src = this.props.href;
  },

  render: function() {
    if (this.state.img == "yes") {
      return(
        <span>
          <a href={this.props.href} target="_blank">{this.props.href}</a><br/>
          <img className="link" src={this.props.href} />
        </span>
      )
    }

    return (
      <a href={this.props.href} target="_blank">{this.props.href}</a>
    )
  }
})

function m_thumbnail(mxc, w, h) {
  return homeserver +
    "/_matrix/media/r0/thumbnail/" +
    mxc.substring(6) +
    "?width=" + w +
    "&height=" + h;
}

function m_download(mxc) {
  return homeserver +
    "/_matrix/media/r0/download/" +
    mxc.substring(6);
}

function sortEvents(a, b) {
  return a.origin_server_ts-b.origin_server_ts
}

function uniqEvents(a, b) {
  return a.event_id === b.event_id;
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
)
