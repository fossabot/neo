const React = require("react");
const create = require("create-react-class");
const Promise = require('bluebird');
const urllib = require('url');

let debounce = require('debounce');
let blank = require('../../assets/blank.jpg');
let neo = require('../../assets/neo.png');

let List = create({
  displayName: "List",
  getInitialState: function() {
    return({
      menu: false,
      element: null
    });
  },

  toggleMenu: function() {
    this.setState({menu: true});
  },

  setStateFromChild: function(prop, value) {
    this.setState({
      [prop]: value
    });
  },

  setRef: function(element) {
    this.setState({element: element});
  },

  render: function() {
    let rooms = this.props.rooms;
    let sortedRooms = Object.keys(rooms).sort(
      function(a, b) {
        return rooms[b].lastMessage.origin_server_ts - rooms[a].lastMessage.origin_server_ts;
      }
    );
    let list = sortedRooms.map((roomid) =>
      <RoomEntry
        lastEvent={rooms[roomid].lastMessage}
        rooms={rooms}
        active={this.props.room == roomid}
        key={roomid}
        id={roomid}
        user={this.props.user}
        userinfo={this.props.userinfo}
        get_userinfo={this.props.get_userinfo}
        setParentState={this.props.setParentState}
        notif={rooms[roomid].notif}
      />
    );

    return(
      <React.Fragment>
        <div className="darken" />
        <div className="list no-select" id="list">
          <div className="header">
            <img src={this.props.icon.hamburger.dark} alt="menu" onClick={this.toggleMenu}/>
            <span>Neo</span> {/* Can be used for search later*/}
          </div>
          <Menu
            menu={this.state.menu}
            setParentState={this.setStateFromChild}
            logout={this.props.logout}
            user={this.props.user}
            setUser={this.props.setParentState}
            userinfo={this.props.userinfo}
          />
          <div className="scroll">
            <Invites 
              invites={this.props.invites}
              user={this.props.user}
              userinfo={this.props.userinfo}
              get_userinfo={this.props.get_userinfo}
              remove={this.props.removeInvite}
            />
            <div className="joinedRooms">
              {list}
            </div>
          </div>
        </div>
      </React.Fragment>
    );
  },
})

let Menu = create({
  getInitialState: function() {
    return ({
      settings: false
    });
  },

  close: function() {
    this.props.setParentState("menu", false);
    this.setState({settings: false, join: false});
  },

  join: function() {
    this.props.setParentState("menu", false);
    this.setState({join: true});
  },

  settings: function() {
    this.props.setParentState("menu", false);
    this.setState({settings: true});
  },

  logout: function() {
    this.props.setParentState("menu", false);
    this.props.logout();
  },

  render: function() {
    let style={};
    let content = null;

    if (this.props.menu) {
      style = {width: "20vw"};
      darken().then(
        () => this.close()
      );
    }

    return (
      <React.Fragment>
        <div style={style} id="menu">
          <div id="user">
            <img src={this.props.userinfo[this.props.user.user_id].img}/>
            <span>{this.props.userinfo[this.props.user.user_id].name}</span>
          </div>
          {/*<div>New Room</div>*/}
          <div onClick={this.join}>Join Room</div>
          <div onClick={this.settings}>Settings</div>
          <div onClick={this.logout}>Log out</div>
        </div>
        <Settings
          settings={this.state.settings}
          user={this.props.user}
          setUser={this.props.setUser}
        />
        <Join join={this.state.join} user={this.props.user}/>
      </React.Fragment>
    );
  }
})

let Settings = create({
  setting: function(cat, setting, value) {
    let user = this.props.user;
    user.settings[cat][setting] = value;
    this.props.setUser("user", user);
    localStorage.setItem("user", JSON.stringify(user));
  },

  render: function() {
    if (!this.props.settings) {
      return null
    }

    let booleans = Object.keys(this.props.user.settings.bool).map((setting, key) => {
      return (
        <div className="bool" key={key}>
          <label htmlFor={"bool-" + key} className="label">{setting.charAt(0).toUpperCase() + setting.slice(1)}</label>
          <label className="switch">
            <input id={"bool-" + key} type="checkbox" checked={this.props.user.settings.bool[setting]} onChange={(e) => {
              this.setting("bool", setting, e.target.checked);
            }}/>
            <span className="slider"/>
          </label>
          <br/>
        </div>
      );
    })

    let inputs = Object.keys(this.props.user.settings.input).map((setting, key) => {
      return (
        <div className="input" key={key}>
          <label htmlFor={"input-" + key} className="label">{setting.charAt(0).toUpperCase() + setting.slice(1)}</label>
          <input id={"input-" + key} type="input" value={this.props.user.settings.input[setting]} onChange={(e) => {
            debounce(this.setting("input", setting, e.target.value), 1000);
          }}/>
          <br/>
        </div>
      );
    })

    return (
      <div id="settings">
        <h1>Neo Settings</h1>
        <h3>Chat Settings</h3>
        <div className="boolean">
          {booleans}
        </div><br/>
        <div className="inputs">
          {inputs}
        </div>
      </div>
    );
  }
})

let Join = create({
  getInitialState: function() {
    return ({
      error: null
    });
  },

  join: function(event) {
    event.preventDefault();
    let id = document.getElementById("roomid").value;

    let url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: `/_matrix/client/r0/join/${id}`,
      query: {
        access_token: this.props.user.access_token
      }
    }));

    fetch(url, {
      method: 'POST'
    })
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.error != undefined) {
          this.setState({error: responseJson.error});
        }
      })
  },

  setRef: function(element) {
    if (element != null) {
      element.addEventListener("submit", this.join)
    }
  },

  render: function() {
    if (this.props.join) {
      return (
        <div id="join">
          <h1>Join an existing Room</h1>
          <form ref={this.setRef}>
            <label htmlFor="roomid">Room Id or Alias: </label>
            <input type="text" id="roomid" />
            <input type="submit" value="Join room" />
            {this.state.error &&
              <div className="error">{this.state.error}</div>
            }
          </form>
        </div>
      );
    }
    return null;
  }
})

let Invites = create({
  displayName: "Invites",
  render: function() {
    let invites = this.props.invites;
    if (invites == null) {
      return null;
    }
    let inviteKeys = Object.keys(invites);
    if (inviteKeys.length == 0) {
      return null;
    }
    let list = inviteKeys.map((roomId) => 
      <InviteEntry
        key={roomId}
        roomId={roomId}
        user={this.props.user}
        userinfo={this.props.userinfo}
        get_userinfo={this.props.get_userinfo}
        invite={invites[roomId]}
        remove={() => this.props.remove(roomId)}
      />
    );
    return (
      <div className="invites">
        {list}
      </div>
    );
  }
})

let InviteEntry = create({
  displayName: "InviteEntry",
  getInitialState: function() {
    if (this.props.userinfo[this.props.invite.invitedBy] == undefined && this.props.invite.invitedBy != null) {
      this.props.get_userinfo(this.props.invite.invitedBy);
    }
    return {};
  },

  accept: function() {
    let id = this.props.roomId;
    console.log("accepting ", id)
    let url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: `/_matrix/client/r0/rooms/${id}/join`,
      query: {
        access_token: this.props.user.access_token
      }
    }));

    fetch(url, {
      method: 'POST'
    })
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.error != undefined) {
          console.error(responseJson);
        }
      })
    this.props.remove();
  },

  decline: function() {
    let id = this.props.roomId;
    console.log("declining ", id)

    let url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: `/_matrix/client/r0/rooms/${id}/leave`,
      query: {
        access_token: this.props.user.access_token
      }
    }));

    fetch(url, {
      method: 'POST'
    })
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.error != undefined) {
          console.error(responseJson);
        }
      })
    this.props.remove();
  },


  render: function() {
    let msg = "";
    if (this.props.invite.invitedBy != null && this.props.userinfo[this.props.invite.invitedBy] != undefined) {
      msg = <React.Fragment><b>{this.props.userinfo[this.props.invite.invitedBy].name}</b> invited you</React.Fragment>
    }
    return(
      <div
        id="invite_item">
        <img
          height="70px"
          width="70px"
          src={this.props.invite.avatar}
          onError={(e)=>{e.target.src = blank}}
        />
        <span id="name">
          {this.props.invite.name}
        </span><br/>
        <span className="last_msg">
          {msg}
        </span><br/>
        <span className="response">
          <button onClick={this.accept} id="accept">Accept</button>
          <button onClick={this.decline} id="decline">Decline</button>
        </span>
      </div>
    );
  }
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
    let url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: `/_matrix/client/r0/rooms/${this.props.id}/state/m.room.name`,
      query: {
        access_token: this.props.user.access_token
      }
    }));

    fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if (responseJson.name != undefined) {
          this.setState({name: responseJson.name});
        }
      })

    url = urllib.format(Object.assign({}, this.props.user.hs, {
      pathname: `/_matrix/client/r0/rooms/${this.props.id}/state/m.room.avatar`,
      query: {
        access_token: this.props.user.access_token
      }
    }));

    fetch(url)
      .then(response => response.json())
      .then(responseJson => {
        if(responseJson.errcode == undefined) {
          let avatar_url = responseJson.url.substring(6);
          this.setState({
            img: urllib.format(Object.assign({}, this.props.user.hs, {
              pathname: `/_matrix/media/r0/download/${avatar_url}`
            }))
          });
        }
      })
  },

  switchRoom: function() {
    this.props.setParentState("room", this.props.id)
    let user = this.props.user;

    let url = urllib.format(Object.assign({}, user.hs, {
      pathname: `/_matrix/client/r0/rooms/${this.props.id}/receipt/m.read/${this.props.lastEvent.event_id}`,
      query: {
        access_token: user.access_token
      }
    }))

    fetch(url, {
      headers: {
        'content-type': 'application/json'
      },
      method: 'POST',
    })
    let rooms = this.props.rooms;
    rooms[this.props.id].notif = {unread: 0, highlight: 0};
    this.props.setParentState("rooms", rooms);
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
    if (this.props.userinfo[this.props.lastEvent.sender] == undefined) {
      this.props.get_userinfo(this.props.lastEvent.sender);
    }
    let user = this.props.userinfo[this.props.lastEvent.sender].name;
    let unread_count = this.props.notif.unread;
    if (this.props.notif.highlight > 0) {
      unread_count = "@";
    }
    return (
      <div
        id="room_item"
        className={this.props.active ? "active" : ""}
        onClick={this.switchRoom}>
        <img
          height="70px"
          width="70px"
          src={this.state.img}
          onError={(e)=>{e.target.src = blank}}
        />
        <span id="name">
          {this.state.name}
        </span><br/>
        <span className="align_right">
          <span className="timestamp">
            {time_string}
          </span><br/>
          {this.props.notif.unread > 0 &&
              <div className="unread">{unread_count}</div>
          }
        </span>
        <span className="last_msg">
          <b>{user}:</b> {this.props.lastEvent.content.body}
        </span>
      </div>
    );
  }
})

let darken = function() {
  // Darken the whole screen, except dialog, resolve on click
  return new Promise(function(resolve, reject) {
    let div = document.getElementsByClassName("darken")[0];
    div.onclick = () => {
      let div = document.getElementsByClassName("darken")[0];
      div = Object.assign(div.style, {zIndex: "-1", backgroundColor: "hsla(0, 0%, 0%, 0)"});
      resolve();
    };
    div = Object.assign(div.style, {zIndex: "50", backgroundColor: "hsla(0, 0%, 0%, 0.5)"});
  });
}

module.exports = List;