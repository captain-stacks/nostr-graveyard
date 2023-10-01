import './App.css'
import {
  SimplePool,
  nip19,
  nip04,
} from 'nostr-tools'
import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { useParams } from 'react-router-dom'

const pool = new SimplePool()
window.pool = pool
window.nip19 = nip19
window.nip04 = nip04

function App() {
  const [pubkey, setPubkey] = useState()
  const [contacts, setContacts] = useState([])
  const [relays, setRelays] = useState([
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://nostr.bitcoiner.social/',
    'wss://nostr21.com/',
    'wss://nostr-pub.wellorder.net',
    'wss://offchain.pub',
    'wss://relay.current.fyi',
    'wss://nostr.shroomslab.net',
    'wss://relayable.org',
    'wss://nostr.thank.eu'
  ].map(r => [r, {read: true, write: true}]))

  useEffect(() => {
    let pubkey = localStorage.getItem('pubkey')
    if (pubkey) {
      setPubkey(pubkey)
    } else {
      setTimeout(() => {
        window.nostr.getPublicKey()
          .then(pubkey => {
            localStorage.setItem('pubkey', pubkey)
            setPubkey(pubkey)
        })
      }, 200)
    }
  }, [])

  useEffect(() => {
    if (pubkey) {
      (async () => {
        await profile()
        loadData()
      })()
    }
  }, [pubkey])

  function getReadRelays() {
    return relays.filter(r => r[1].read).map(r => r[0])
  }

  function getWriteRelays() {
    return relays.filter(r => r[1].write).map(r => r[0])
  }

  function getAllRelays() {
    return relays.map(r => r[0])
  }

  window.getWriteRelays = getWriteRelays
  window.getReadRelays = getReadRelays
  window.getAllRelays = () => relays.map(r => r[0])
  
  async function profile() {
    setContacts([])
    let filter = {
      kinds: [3],
      authors: [pubkey]
    }
    let events = await pool.list(getReadRelays(), [filter])
    events.sort((a, b) => b.created_at - a.created_at)
    let follows = events[0].tags.filter(t => t[0] === 'p').map(t => t[1])
    follows.push(pubkey)
    
    filter = {
      kinds: [0],
      authors: follows
    }
    window.myFollows = {}
    for (let f of follows) {
      window.myFollows[f] = {
        followedBy: [],
        mutedBy: [],
        reportedBy: []
      }
    }
    events = await pool.list(getReadRelays(), [filter])
    let contacts = []
    let profiles = {}
    events.forEach(e => {
      try {
        let c = JSON.parse(e.content)
        c.npub = nip19.npubEncode(e.pubkey)
        c.name = c.displayName || c.name
        c.distrust = new Set()
        c.followers = 0
        contacts.push(c)
        profiles[e.pubkey] = c
      } catch (e) {
        console.log('e', e)
      }
    })
    setContacts(contacts)
    window.events = events
    window.profiles = profiles
  }

  async function follows(users) {
    let filter = {
      kinds: [3],
      authors: users
    }
    let prefollows = await pool.list(getReadRelays(), [filter])
    let follows = []
    prefollows.forEach( (event) => {
      var array = []
      array.push(event["tags"])
      var l = [event.pubkey]
      array[0].forEach(item => l.push(item[1]))
      follows.push(l)
      l.forEach( (p) => {
        if (p in window.myFollows) {
          window.myFollows[p].followedBy.push(l[0])
        }
      })
    })
    window.list_of_people_followed_by_my_followers = follows;
  }

  async function findRelays() {
    let events = await pool.list(getAllRelays(), [{
      kinds: [3, 10_002],
      authors: [await window.nostr.getPublicKey()]
    }])
    events = events.filter(e => !(e.kind === 3 && !e.content))
    events.sort((a, b) => b.created_at - a.created_at)
    let event = events[0]
    let relays = event.kind === 3
      ? Object.entries(JSON.parse(event.content))
      : event.tags
        .filter(t => t[0] === 'r')
        .map(t => [t[1], !t[2]
          ? {read: true, write: true}
          : {read: t[2] === 'read', write: t[2] === 'write'}])
    console.log(relays)
    console.log(event)
    setRelays(relays)
  }

  window.follows = follows

  window.pool = pool
  window.getReadRelays = getReadRelays

  async function loadDistrust() {
    let users = Object.keys(window.myFollows)
    let filters = [{
      kinds: [10_000],
      authors: users,
      '#p': users
    }, {
      kinds: [30_000],
      authors: users,
      '#d': ['mute'],
      '#p': users
    }, {
      kinds: [1984],
      authors: users,
      '#p': users
    }, {
      kinds: [3],
      authors: users,
      '#p': users
    }]
    for (let filter of filters) {
      let events = await pool.list(getReadRelays(), [filter])
      //console.log('users-', users)
      console.log('events-', events)
      events.forEach(e => {
        if (e.kind === 1984) {
          if (e.tags.find(t => t[0] === 'p')[1] in window.myFollows) {
            window.myFollows[e.tags.find(t => t[0] === 'p')[1]].reportedBy.push(e.pubkey)
          }
        } else if (e.kind === 3) {
          e.tags.filter(t => t[0] === 'p').forEach(t => {
            window.myFollows[t[1]]?.followedBy.push(e.pubkey)
          })
        } else {
          e.tags.filter(t => t[0] === 'p').forEach(t => {
            window.myFollows[t[1]]?.mutedBy.push(e.pubkey)
          })
        }
      })
    }
  }

  async function loadData() {
    await loadDistrust()

    let myFollows = window.myFollows
    let profiles = window.profiles

    Object.keys(myFollows).forEach(k => {
      let f = myFollows[k]
      f.mutedBy.forEach(u => {
        if (profiles[u]) profiles[k]?.distrust.add('muted by ' + profiles[u].name)
      })
      f.reportedBy.forEach(u => {
        if (profiles[u]) profiles[k]?.distrust.add('reported by ' + profiles[u].name)
      })
      f.followedBy.forEach(u => {
        if (profiles[u] && profiles[k]) profiles[k].followers++
      })
    })
    setContacts(c => {
      console.log('contacts', c)
      console.log('filtered', [...c].filter(c => c.distrust.size))
      c = [...c].filter(c => c.distrust.size)
      c.forEach(c => c.score = Math.floor(100 * c.followers / (c.distrust.size + c.followers)))
      c.sort((a, b) => a.score - b.score)
      return c
    })
  }

  function Page() {
    const { npub } = useParams()
    setPubkey(npub ? nip19.decode(npub).data : localStorage.getItem('pubkey'))

    return (
      <div className="App">
        <header className="App-header">
          <div className="container">
            <Link to='/'>Home</Link>
            <p/>
            {/* {relays.map(r => <div>{r[0]}</div>)} */}
            {contacts.map(c => <div key={c.npub}>
              <Link to={'/' + c.npub}>
                <img src={c.picture} alt="" width={100}/>
              </Link>
              {' '} {c.name}
              <br/> {c.score}%
              {' '} trusted {c.followers} followers
              {[...c.distrust].map(d => <div key={d}>
                <small><small>{d}</small></small>
              </div>)}
              <p/>
            </div>)}
          </div>
        </header>
      </div>
    )
  }

  return (
    <Router>
      <Routes>
        <Route path="/:npub?" element={<Page/>}/>
      </Routes>
    </Router>
  )
}

export default App
