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
  const [contactList, setContactList] = useState()
  const [muteList, setMuteList] = useState(new Set(JSON.parse(localStorage.getItem('muteList') || '[]')))

  useEffect(() => {
    async function init() {
      await new Promise(resolve => setTimeout(resolve, 200))
      const pubkey = await window.nostr.getPublicKey()
      const decodedPubkey = npub ? nip19.decode(npub).data : pubkey
      setPubkey(decodedPubkey)
      //fetchProfile(decodedPubkey)
      fetchEvents(decodedPubkey)
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

  const fetchEvents = async (pubkey, updatedMuteList) => {
    try {
      updatedMuteList ??= muteList
      const since = Math.floor(Date.now() / 1000) - 1 * 24 * 60 * 60
      let mentionsSince
      //const mentionsSince = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60
      let authors
      if (contactList) {
        authors = contactList
      } else {
        const contactListEvents = await pool.querySync(getAllRelays(), {
          kinds: [3],
          authors: [pubkey]
        })
        const mostRecentContactListEvent = contactListEvents.sort((a, b) => b.created_at - a.created_at)[0]
        authors = new Set(
          mostRecentContactListEvent 
            ? mostRecentContactListEvent.tags
                .filter(tag => tag[0] === 'p')
                .map(tag => tag[1])
            : []
        )
        setContactList(authors)
      }
      authors.add(pubkey)
      authors = [...authors]
      if (authors.length === 0) {
        console.error('No authors found in contact list')
        return
      }
      authors = authors.filter(a => !updatedMuteList.has(a))
      let events = await pool.querySync(getAllRelays(), {
        kinds: [1],
        authors: authors,
        since: since
      })
      const mentions = await pool.querySync(getAllRelays(), {
        '#p': [pubkey],
        since: mentionsSince ?? since
      })
      events = events
        .concat(mentions.filter(
          e => ![3, 4].includes(e.kind) &&
          e.content.indexOf('direct message activity:') === -1))
        .sort((a, b) => b.created_at - a.created_at)
      events = events.filter((e, i) => events.findIndex(e2 => e2.id === e.id) === i)
      events = events.map(event => ({
        ...event,
        content: replaceYouTubeLinks(event.content)
      }))
      setEvents(events)
      setLoading(false)
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
      Promise.all(pool.publish(getAllRelays(), event))
        .catch(e => console.error('error publishing', e))
      setNewEventContent('')
      fetchEvents(pubkey)
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

  const openProfile = (user) => {
    window.open(`https://primal.net/p/${nip19.npubEncode(user)}`, '_blank')
  }

  const toggleMuteUser = (user) => {
    setLoading(true)
    const updatedMuteList = new Set(muteList)
    if (updatedMuteList.has(user)) {
      updatedMuteList.delete(user)
    } else {
      updatedMuteList.add(user)
    }
    setMuteList(updatedMuteList)
    localStorage.setItem('muteList', JSON.stringify([...updatedMuteList]))
    fetchEvents(pubkey, updatedMuteList)
  }

  return (
    <Box sx={{ padding: 2 }}>
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
            style={{ width: '700px' }}
          />&nbsp;
          <button onClick={handlePostEvent}>Post Event</button>
          <p/>
          <table style={{ width: '75%', borderCollapse: 'collapse' }}>
            <tbody>
              {events.map(event => (
                <tr key={event.id} style={{
                  backgroundColor: event.tags.some(tag => tag[0] === 'p' && tag[1] === pubkey)
                    ? 'lightgreen' : 'white',
                  border: '1px solid black' }}>
                  <td onClick={() => openProfile(event.pubkey)} style={{ cursor: 'pointer', color: 'blue' }}>
                    {authorNames[event.pubkey] || 'Unknown'}
                  </td>
                  <td style={{ wordWrap: 'break-word', maxWidth: '600px'}}
                    dangerouslySetInnerHTML={{ __html: event.content }}></td>
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
    "wss://nos.lol",
    "wss://relay.damus.io",
    "wss://nostr21.com",
  ]
}

const replaceYouTubeLinks = (content) => {
  const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g
  return content.replace(youtubeRegex, (match, p1) => {
    return `<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/${p1}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
  })
}

export default App