export default class Mutuals {
  constructor() {
      this.graph = new Map()
  }

  addEdge(u, v) {
      if (u === v) return
      if (!this.graph.has(u)) this.graph.set(u, new Set())
      this.graph.get(u).add(v)
  }

  findMutualConnections() {
      const mutualConnections = []
      for (let [u, neighbors] of this.graph) {
          for (let v of neighbors) {
              if (this.graph.has(v) && this.graph.get(v).has(u)) {
                  mutualConnections.push([u, v])
              }
          }
      }
      return mutualConnections
  }
}