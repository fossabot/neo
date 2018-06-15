'use strict';

//const React = require('react');
const urllib = require('url');
const rfetch = require('fetch-retry');
const Event = require('./Events.js');
const defaultValue = require('default-value');
const Promise = require('bluebird');
const uniq = require('arr-uniq');

const options = {retries: 5, retryDelay: 200};

const blank = require('../../assets/blank.jpg');

let Matrix = {
  initialSyncRequest: function(user) {
    console.log("neo: initialSyncRequest");
    return new Promise((resolve, reject) => {
      let localRooms = {};
      let url = urllib.format(Object.assign({}, user.hs, {
        pathname: "/_matrix/client/r0/joined_rooms",
        query: {
          access_token: user.access_token
        }
      }));

      return rfetch(url, options)
        .then((response) => response.json())
        .catch((error) => {
          console.error('Error:', error);
          reject(error);
        })
        .then((responseJson) => {
          return Promise.map(responseJson.joined_rooms, (roomId) => {
            // Get backlog and userlist for all rooms
            return this.getRoomInfo(user, roomId);
          })
            .then((roomInfoArray) => {
              Promise.map(roomInfoArray, (roomInfo) => {
                let roomId = roomInfo[0];
                let localUsers = roomInfo[2];

                return Promise.all([
                  roomInfo,
                  this.getRoomDetails(user, roomId, localUsers)
                ]);
              })
                .then((roomDetails) => {
                  let userInfo = {};
                  roomDetails.forEach((roomDetail) => {
                    let roomInfo = roomDetail[0];
                    let roomId = roomInfo[0];
                    let localUsers = roomInfo[2];

                    localRooms[roomId] = roomInfo[1];
                    localRooms[roomId].users = localUsers;
                    localRooms[roomId].unsentEvents = {};
                    localRooms[roomId].info = {
                      name: roomDetail[1][0],
                      avatar: roomDetail[1][1]
                    };

                    Object.keys(localUsers).forEach((userId) => {
                      let userData = localUsers[userId];
                      userInfo[userId] = userData;
                    });

                  });

                  console.log("neo: done getting all backlog/userlists");
                  resolve([localRooms, userInfo]);
                });
            });
        });
    });
  },

  getRoomInfo: function(user, roomId) {
    return Promise.all([
      roomId,
      this.getBacklog(user, roomId),
      this.getUserlist(user, roomId)
    ]);
  },

  getBacklog: function(user, roomId) {
    let query = {
      limit: 80,
      dir: "b"
    };
    return this.getMessages(user, roomId, query)
      .then((newEvents) => {
        return this.parseEvents({}, newEvents);
      });
  },

  getMessages: function(user, roomId, query) {
    return new Promise((resolve, reject) => {
      query.access_token = user.access_token;
      let url = urllib.format(Object.assign({}, user.hs, {
        pathname: `/_matrix/client/r0/rooms/${roomId}/messages`,
        query: query
      }));

      return rfetch(url, options)
        .then((response) => response.json())
        .catch((error) => {
          console.error('Error:', error);
          reject(error);
        })
        .then((responseJson) => {
          let chunk = responseJson.chunk;
          let newEvents = {};
          chunk.forEach((event) => {
            newEvents[event.event_id] = event;
          });

          resolve(newEvents);
        });
    });
  },

  getUserlist: function(user, roomId) {
    return new Promise((resolve, reject) => {
      let url = urllib.format(Object.assign({}, user.hs, {
        pathname: `/_matrix/client/r0/rooms/${roomId}/joined_members`,
        query: {
          access_token: user.access_token
        }
      }));

      return rfetch(url, options)
        .then((response) => response.json())
        .catch((error) => {
          console.error('Error:', error);
          reject(error);
        })
        .then((responseJson) => {
          let remoteUsers = responseJson.joined;
          let localUsers = {};

          Object.keys(remoteUsers).forEach((userId) => {
            let remoteUser = remoteUsers[userId];
            if (remoteUser.display_name == undefined) {
              remoteUser.display_name = userId;
            }
            if (remoteUser.avatar_url == undefined) {
              remoteUser.img = blank;
            } else { 
              remoteUser.img = this.m_thumbnail(
                user.hs,
                remoteUser.avatar_url,
                64,
                64
              );
            }
            localUsers[userId] = remoteUser;
          });
          resolve(localUsers);
        });
    });
  },

  getRoomDetails: function(user, roomId, localUsers) {
    return new Promise((resolve, reject) => {
      let partnerName;
      let partnerAvatar;

      let localUsersKeys = Object.keys(localUsers);
      if (localUsersKeys.length == 2) { //only one other person, so a pm
        let otherUserId = localUsersKeys.filter((userId) => {
          if (userId != user.user_id) {
            return true;
          }
          return false;
        })[0];
        let otherUser = localUsers[otherUserId];
        partnerName = otherUser.display_name;
        console.log(roomId, "is a pm with", partnerName);
        partnerAvatar = otherUser.img;
      }

      Promise.all([
        this.getRoomName(user, roomId),
        this.getRoomAvatar(user, roomId),
        this.getRoomAliases(user, roomId)
      ])
        .then((roomInfo) => {
          // Order of defaultValues:
          // room.name
          // partnerName
          // room canonical alias
          // roomId

          let displayName = 
            defaultValue(
              defaultValue(
                defaultValue(
                  roomInfo[0],
                  partnerName
                ),
                roomInfo[2]
              ),
              roomId
            );

          // Order of defaultValues:
          // room.avatar
          // partnerAvatar
          // blank

          let avatar = defaultValue(
            defaultValue(
              roomInfo[1],
              partnerAvatar
            ),
            blank
          );
          
          resolve([displayName, avatar]);
        });
    });
  },

  getRoomName: function(user, roomId) {
    return new Promise((resolve, reject) => {
      let nameUrl = urllib.format(Object.assign({}, user.hs, {
        pathname: `/_matrix/client/r0/rooms/${roomId}/state/m.room.name`,
        query: {
          access_token: user.access_token
        }
      }));


      fetch(nameUrl)
        .then(response => response.json()) //catch + reject
        .then(responseJson => {
          resolve(responseJson.name);
        });
    });
  },

  getRoomAvatar: function(user, roomId) {
    return new Promise((resolve, reject) => {
      let avatarUrl = urllib.format(Object.assign({}, user.hs, {
        pathname: `/_matrix/client/r0/rooms/${roomId}/state/m.room.avatar`,
        query: {
          access_token: user.access_token
        }
      }));

      fetch(avatarUrl)
        .then(response => response.json())
        .then(responseJson => {
          if(responseJson.errcode == undefined) {
            resolve(this.m_download(user.hs, responseJson.url));
          }
          resolve(undefined);
        });
    });
  },

  getRoomAliases: function(user, roomId) {
    return new Promise((resolve, reject) => {
      let canonicalAliasUrl = urllib.format(Object.assign({}, user.hs, {
        pathname: `/_matrix/client/r0/rooms/${roomId}/state/m.room.canonical_alias`,
        query: {
          access_token: user.access_token
        }
      }));

      fetch(canonicalAliasUrl)
        .then(response => response.json())
        .then(responseJson => {
          if (responseJson.content != undefined) {
            resolve(responseJson.content.alias);
          }
          resolve(undefined);
        });
    });
  },

  syncRequest: function(user, localState) {
    return new Promise((resolve, reject) => {
      let url = Object.assign({}, user.hs, {
        pathname: "/_matrix/client/r0/sync",
        query: {
          timeout: 30000,
          access_token: user.access_token
        }
      });

      if(user.next_batch != undefined) {
        url.query.since = user.next_batch;
      }

      return rfetch(urllib.format(url), options)
        .then((response) => response.json())
        .catch((error) => {
          console.error('Error:', error);
          reject(error);
        })
        .then((responseJson) => {
          if (responseJson == undefined) {
            console.log('response was undefined');
            return;
          }
          
          let remoteRooms = responseJson.rooms.join;
          let next_batch = responseJson.next_batch;

          return Promise.map(Object.keys(remoteRooms), (roomId) => {
            let localRoom = localState.rooms[roomId];

            return new Promise((resolve, reject) => {
              if (localRoom == undefined) {
                return this.getRoomInfo(user, roomId)
                  .then((infoArray) => {
                    let localUsers = infoArray[2];
                    return this.getRoomDetails(user, roomId, localUsers)
                      .then((roomDetails) => {
                        localRoom = infoArray[1];
                        localRoom.users = localUsers;
              
                        localRoom.info = {
                          name: roomDetails[0],
                          avatar: roomDetails[1]
                        };
                        resolve(localRoom);
                      });
                  });
              }
              resolve(localRoom);
            }).then((localRoom) => {
              let remoteRoom = remoteRooms[roomId];
  
              let newEvents = {};
              remoteRoom.timeline.events.forEach((event) => {
                newEvents[event.event_id] = event;
              });
  
              localRoom = this.parseEvents(localRoom, newEvents);
  
              let unread = defaultValue(
                remoteRoom.unread_notifications.notification_count,
                0
              );
  
              let highlight = defaultValue(
                remoteRoom.unread_notifications.highlight_count,
                0
              );
              localRoom.notif = {unread: unread, highlight: highlight};
              localRoom.prev_batch = remoteRoom.timeline.prev_batch;
              localRoom.limited = remoteRoom.timeline.limited;
              return [roomId, localRoom];
            });
          }).then((localRoomsArray) => {
            localRoomsArray.forEach((localRoomInfo) => {
              let roomId = localRoomInfo[0];
              let localRoom = localRoomInfo[1];
              localState.rooms[roomId] = localRoom;
            });

            let remoteInvites = responseJson.rooms.invite;
            let localInvites = this.parseInvites(user, localState.invites, remoteInvites);
            resolve([localState.rooms, localInvites, next_batch]);
          });
        });
    });
  },

  parseEvents: function(room, newEvents) {
    let oldEvents = defaultValue(room.events, {});

    let combinedEvents = Object.assign(
      {},
      oldEvents,
      newEvents
    );

    let eventIndex = Object.keys(combinedEvents);
    let sortedEventIndex = eventIndex.sort(function(a, b) {
      return combinedEvents[a].origin_server_ts-combinedEvents[b].origin_server_ts;
    });

    let uniqueEventIndex = uniq(sortedEventIndex);
    
    room = Object.assign(room, {
      events: combinedEvents,
      eventIndex: uniqueEventIndex
    });

    let lastEvent = {
      origin_server_ts: 0,
      content: {
        body: ""
      }
    };

    let unsentEvents = defaultValue(room.unsentEvents, {});
    let updatedUnsentEvents = this.updateUnsent(combinedEvents, unsentEvents);

    uniqueEventIndex.slice().reverse().some((eventId) => {
      let event = combinedEvents[eventId];
      if (Event.asText(event) != null) {
        lastEvent = event;
        return true;
      }
      return false;
    });

    room.lastEvent = lastEvent;
    room.unsentEvents = updatedUnsentEvents;
    return room;
  },

  updateUnsent: function(combinedEvents, unsentEvents) {
    let unsentEventsKeys = Object.keys(unsentEvents);
    if (unsentEventsKeys.length == 0) {
      return;
    }
    Object.keys(unsentEvents).forEach((eventId) => {
      let unsentEvent = unsentEvents[eventId];
      if (combinedEvents[unsentEvent.id] != undefined) {
        delete unsentEvents[eventId];
      }
    });
    return unsentEvents;
  },

  parseInvites: function(user, localInvites, remoteInvites) {
    Object.keys(remoteInvites).forEach((inviteId) => {
      // Check if invite wasn't already handled
      // invites will stay in /sync until handled
      if (localInvites.closed[inviteId] == undefined) {
        let remoteInvite = remoteInvites[inviteId];
        let name = inviteId;
        let avatar = blank;
        let invitedBy = null;

        Object.keys(remoteInvite.invite_state.events).forEach((eventId) => {
          let event = remoteInvite.invite_state.events[eventId];
          if (event.type == "m.room.name") {
            name = event.content.name; //Should fallback to alias/pm username
          } else if (event.type == "m.room.avatar") {
            avatar = this.m_download(user.hs, event.content.url);
          } else if (event.type == "m.room.member") {
            if (event.content.membership == "invite") {
              invitedBy = event.sender;
            }
          }
        });
        localInvites.open[inviteId] = {display_name: name, avatar: avatar, invitedBy: invitedBy};
      }
    });
    return localInvites;
  },

  sendEvent: function(user, roomId, body) {
    return new Promise((resolve, reject) => {
      let unixtime = Date.now();
      let url = urllib.format(Object.assign({}, user.hs, {
        pathname: `/_matrix/client/r0/rooms/${roomId}/send/m.room.message/${unixtime}`,
        query: {
          access_token: user.access_token
        }
      }));

      body = {
        msgtype: "m.text",
        body: body
      };

      return rfetch(url, {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: new Headers({
          'Content-Type': 'application/json'
        })
      }, options).then((res) => res.json())
        .catch(error => {
          console.error('Error:', error);
          reject(error);
        })
        .then((response) => resolve(response));
    });
  },

  kickUser: function(user, roomId, userId, reason) {
    return new Promise((resolve, reject) => {
      let url = urllib.format(Object.assign({}, user.hs, {
        pathname: `/_matrix/client/r0/rooms/${roomId}/kick`,
        query: {
          access_token: user.access_token
        }
      }));

      let body = {
        "reason": reason,
        "user_id": userId
      };

      return rfetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: new Headers({
          'Content-Type': 'application/json'
        })
      }, options).then((res) => res.json())
        .catch(error => {
          console.error('Error:', error);
          reject(error);
        })
        .then((response) => resolve(response));
    });
  },

  m_thumbnail: function(hs, mxc, w, h) {
    return urllib.format(Object.assign({}, hs, {
      pathname: `/_matrix/media/r0/thumbnail/${mxc.substring(6)}`,
      query: {
        width: w,
        height: h
      }
    }));
  },
  
  m_download: function(hs, mxc) {
    return urllib.format(Object.assign({}, hs, {
      pathname: `/_matrix/media/r0/download/${mxc.substring(6)}`
    }));
  },

  userInfo: {
    get: function(user, userId) {
      return new Promise((resolve) => {
        return Promise.all([
          this.getName(user, userId),
          this.getImg(user, userId)
        ])
          .then((userInfoArray) => {
            resolve({display_name: userInfoArray[0], img: userInfoArray[1]});
          })
          .catch((err) => {
            console.error("Error fetching", userId, err);
          });
      });
    },

    getName: function(user, userId) {
      return new Promise((resolve, reject) => {
        let url = urllib.format(Object.assign({}, user.hs, {
          pathname: `/_matrix/client/r0/profile/${userId}/displayname`,
          query: {
            access_token: user.access_token
          }
        }));

        return rfetch(url, options)
          .then(response => response.json())
          .then(responseJson => {
            if (responseJson.displayname != undefined) {
              resolve(responseJson.displayname);
            }
          });
      });
    },

    getImg: function(user, userId) {
      return new Promise((resolve, reject) => {
        let url = urllib.format(Object.assign({}, user.hs, {
          pathname: `/_matrix/client/r0/profile/${userId}/avatar_url`,
          query: {
            access_token: user.access_token
          }
        }));

        return rfetch(url, options)
          .then(response => response.json())
          .then(responseJson => {
            if(responseJson.errcode == undefined &&
              responseJson.avatar_url != undefined) {
              resolve(Matrix.m_thumbnail(user.hs, responseJson.avatar_url, 64, 64));
            }
          });
      });
    }
  }
};

module.exports = Matrix;
