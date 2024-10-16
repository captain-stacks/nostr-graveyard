import './App.css'
import {
  SimplePool,
  nip19,
  nip04,
  getPublicKey,
  getEventHash,
  finalizeEvent
} from 'nostr-tools'
import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'

const pool             = new SimplePool()
window.pool            = pool
window.nip19           = nip19
window.nip04           = nip04
window.getPublicKey    = getPublicKey
window.getEventHash    = getEventHash
window.finalizeEvent   = finalizeEvent

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/:npub?" element={<Page />} />
      </Routes>
    </Router>
  )
}

function Page() {
  const { npub } = useParams()
  const [pubkey, setPubkey] = useState('')
  const [profile, setProfile] = useState({})
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState([])
  const [authorNames, setAuthorNames] = useState({})
  const [newEventContent, setNewEventContent] = useState('')

  useEffect(() => {
    async function init() {
      await new Promise(resolve => setTimeout(resolve, 200))
      const pubkey = await window.nostr.getPublicKey()
      const decodedPubkey = npub ? nip19.decode(npub).data : pubkey
      setPubkey(decodedPubkey)
      //fetchProfile(decodedPubkey)
      fetchEvents(pubkey)
      setLoading(false)
    }
    init()
  }, [npub])

  const fetchProfile = async (pubkey) => {
    setLoading(true)
    try {
      const events = await pool.querySync(getAllRelays(), {
        kinds: [0],
        authors: [pubkey]
      })
      if (events.length > 0) {
        const profileEvent = events[0]
        setProfile(JSON.parse(profileEvent.content))
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchEvents = async (pubkey) => {
    try {
      const since = Math.floor(Date.now() / 1000) - 1 * 60 * 60
      const contactListEvents = await pool.querySync(getAllRelays(), {
        kinds: [3],
        authors: [pubkey]
      })
      const mostRecentContactListEvent = contactListEvents.sort((a, b) => b.created_at - a.created_at)[0]
      let authors = new Set(
        mostRecentContactListEvent 
          ? mostRecentContactListEvent.tags
              .filter(tag => tag[0] === 'p')
              .map(tag => tag[1])
          : []
      )
      authors.add(pubkey)
      authors = [...authors]
      if (authors.length === 0) {
        console.error('No authors found in contact list')
        return
      }
      let events = await pool.querySync(getAllRelays(), {
        kinds: [1],
        authors: authors,
        since: since
      })
      const mentions = await pool.querySync(getAllRelays(), {
        '#p': [pubkey],
        since: since
      })
      events = events
        .concat(mentions.filter(
          e => ![3, 4].includes(e.kind) &&
          e.content.indexOf('direct message activity:') === -1))
        .sort((a, b) => b.created_at - a.created_at)
      // remove duplicates
      events = events.filter((e, i) => events.findIndex(e2 => e2.id === e.id) === i)
      setEvents(events)
      const authorPubkeys = [...new Set(events.map(event => event.pubkey))]
      const authorProfiles = await fetchAuthorProfiles(authorPubkeys)
      setAuthorNames(authorProfiles)
    } catch (error) {
      console.error('Error fetching events:', error)
    }
  }

  const fetchAuthorProfiles = async (pubkeys) => {
    const batchSize = 500
    let allProfiles = {}

    for (let i = 0; i < pubkeys.length; i += batchSize) {
      const batch = pubkeys.slice(i, i + batchSize)
      const events = await pool.querySync(getAllRelays(), {
        kinds: [0],
        authors: batch
      })
      events.forEach(e => {
        const content = JSON.parse(e.content)
        allProfiles[e.pubkey] = content.name || content.displayName || 'Unknown'
      })
    }

    return allProfiles
  }

  const handlePostEvent = async () => {
    if (!newEventContent) {
      alert('Event content cannot be empty')
      return
    }

    try {
      let event = {
        kind: 1,
        pubkey: pubkey,
        created_at: Math.floor(Date.now() / 1000),
        content: newEventContent,
        tags: []
      }
      event = await window.nostr.signEvent(event)
      await pool.publish(getAllRelays(), event)
      setNewEventContent('')
      fetchEvents()
    } catch (error) {
      console.error('Error posting event:', error)
    }
  }

  const copyToClipboard = (npub) => {
    navigator.clipboard.writeText(npub).then(() => {
      alert('Copied to clipboard')
    }).catch(err => {
      console.error('Error copying to clipboard:', err)
    })
  }

  return (
    <Box sx={{ padding: 5 }}>
      {loading ? (
        <LinearProgress />
      ) : (
        <div>
          <h2>Nostr Relay Chat</h2>
          <input
            type="text"
            value={newEventContent}
            onChange={(e) => setNewEventContent(e.target.value)}
            placeholder="Enter event content"
            style={{ width: '50%' }}
          />
          <button onClick={handlePostEvent}>Post Event</button>
          <p/>
          <table style={{width: '75%'}}>
            <tbody>
              {events.map(event => (
                <tr key={event.id} style={{ backgroundColor:
                  event.tags.some(tag => tag[0] === 'p' && tag[1] === pubkey)
                    ? 'lightgreen' : 'white' }}>
                  <td>{authorNames[event.pubkey] || event.pubkey}</td>
                  <td style={{ wordWrap: 'break-word', maxWidth: '500px'}}>{event.content}</td>
                  <td>{new Date(event.created_at * 1000).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  )
}

function getAllRelays() {
  return [
    'wss://relay.snort.social',
    'wss://nostr-pub.wellorder.net',
    "wss://nos.lol",
    "wss://relay.damus.io",
    "wss://nostr21.com",
    "wss://offchain.pub",
    'wss://nostr.thank.eu',
    "wss://nostr.mom",
    "wss://nostr.inosta.cc",
    "wss://nostr.fmt.wiz.biz",
    "wss://relay.primal.net",
    "wss://bitcoiner.social",
    "wss://nostr.lu.ke",
    "wss://nostr.oxtr.dev",
  ]
}

export default App