const mosca = require('mosca')
const redis = require('redis')
const ascoltatore = {
  type: 'redis',
  redis,
  db: 12,
  port: 6379,
  return_buffers: true, // to handle binary payloads
  host: 'localhost'
}

const moscaSettings = {
  // port: 1883,
  backend: ascoltatore,
  persistence: {
    factory: mosca.persistence.Redis
  }
}

// fired when the mqtt server is ready
function setup (log, opts) {
  log(`IOT broker is up and running on: ws://localhost:${opts.http.port}/mqqt`)
}

function createAWSLifecycleEvent ({type, clientId, topics}) {
  // http://docs.aws.amazon.com/iot/latest/developerguide/life-cycle-events.html#subscribe-unsubscribe-events
  const event = {
    clientId,
    timestamp: Date.now(),
    eventType: type,
    sessionIdentifier: '00000000-0000-0000-0000-000000000000',
    principalIdentifier: '000000000000/ABCDEFGHIJKLMNOPQRSTU:some-user/ABCDEFGHIJKLMNOPQRSTU:some-user'
  }

  if (topics) {
    event.topics = topics
  }

  return event
}

function createBroker (opts, log) {
  opts = Object.assign({}, moscaSettings, opts)
  const server = new mosca.Server(opts)
  server.on('ready', () => setup(log, opts))

  // fired when a message is received
  server.on('published', function (packet, client) {

    const presence = packet.topic.match(/^\$SYS\/.*\/(new|disconnect)\/clients$/)
    if (presence) {
      const clientId = packet.payload
      const type = presence[1] === 'new' ? 'connected' : 'disconnected'
      server.publish({
        topic: `$aws/events/presence/${type}/${clientId}`,
        payload: JSON.stringify(createAWSLifecycleEvent({
          type,
          clientId
        }))
      })
    }

    const subscription = packet.topic.match(/^\$SYS\/.*\/new\/(subscribes|unsubscribes)$/)
    if (subscription) {
      const type = subscription[1] === 'subscribes' ? 'subscribed' : 'unsubscribed'
      const {clientId, topic} = JSON.parse(packet.payload)
      server.publish({
        topic: `$aws/events/subscriptions/${type}/${clientId}`,
        payload: JSON.stringify(createAWSLifecycleEvent({
          type,
          clientId,
          topics: [topic]
        }))
      })
    }
  })

  return server
}

module.exports = createBroker
