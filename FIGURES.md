# Figures

Built by `node build.mjs` from `figures.plan.json` and the chapters. Do not edit by hand.

`play`: a sequence, converted when the figure has `<ol class="steps">`. `values`: a chart, converted when its marks carry `data-tip`. `still`: stays as drawn.

Playable: 196 of 196 done. With values: 93 of 93 done. Still: 204.

## 1. What system design is (`what-is-system-design`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 1.1 | `fig-zoom` | The same photo app at three levels of zoom | still |  |
| 1.2 | `fig-loop` | The six-step design loop | play | done |

## 2. The journey of a request (`journey-of-a-request`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 2.1 | `fig-path` | The path of one web request | play | done |
| 2.2 | `fig-url` | The parts of a URL | still |  |
| 2.3 | `fig-dns` | A DNS lookup with an empty cache | play | done |
| 2.4 | `fig-handshake` | Round trips before the first response, with TCP plus TLS and with QUIC | play | done |
| 2.5 | `fig-budget` | Time to first byte in three situations | values | done |

## 3. Back-of-the-envelope estimation (`estimation`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 3.1 | `fig-latency` | Typical times for common operations on a logarithmic scale | values | done |
| 3.2 | `fig-chain` | Three chains of multiplication that turn a user count into traffic, storage and bandwidth | still |  |

## 4. Latency, throughput and the tail (`latency-and-throughput`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 4.1 | `fig-anatomy` | The parts of one response time | still |  |
| 4.2 | `fig-histogram` | A typical distribution of response times | values | done |
| 4.3 | `fig-fanout` | One slow backend delays the whole request | still |  |

## 5. Scalability (`scalability`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 5.1 | `fig-up-out` | Scaling up compared with scaling out | still |  |
| 5.2 | `fig-state` | Session state kept in one server compared with a shared store | still |  |
| 5.3 | `fig-evolution` | Eight stages in the growth of an architecture | play | done |
| 5.4 | `fig-amdahl` | Amdahl’s law: speed-up against number of servers | values | done |

## 6. Availability and reliability (`availability-and-reliability`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 6.1 | `fig-series-parallel` | Availability in series and in parallel | still |  |
| 6.2 | `fig-spof` | Removing single points of failure | still |  |
| 6.3 | `fig-domains` | Failure domains nest inside one another | still |  |
| 6.4 | `fig-budget` | An error budget partly spent | values | done |
| 6.5 | `fig-rto-rpo` | RPO and RTO on a timeline | still |  |

## 7. IP addressing, NAT and routing (`ip-and-routing`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 7.1 | `fig-layers` | The four network layers and how each wraps the data from the one above | play | done |
| 7.2 | `fig-cidr` | The address 10.0.5.130 in the block 10.0.0.0/20, bit by bit | still |  |
| 7.3 | `fig-nat` | Network address translation | play | done |
| 7.4 | `fig-bgp` | Autonomous systems exchanging routes with BGP | still |  |
| 7.5 | `fig-anycast` | Anycast routing | still |  |
| 7.6 | `fig-vpc` | A typical virtual network across two availability zones | still |  |

## 8. DNS in depth (`dns`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 8.1 | `fig-tree` | The DNS namespace as a tree divided into zones | still |  |
| 8.2 | `fig-migration` | Moving a name to a new address in four steps | play | done |
| 8.3 | `fig-steering` | An authoritative DNS server steering users to different regions | still |  |
| 8.4 | `fig-dnssec` | The DNSSEC chain of trust | still |  |

## 9. TCP, UDP and QUIC (`transport-protocols`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 9.1 | `fig-tuple` | Three connections to one server port, told apart by the five-tuple | still |  |
| 9.2 | `fig-hol` | Head-of-line blocking in TCP | play | done |
| 9.3 | `fig-cwnd` | A congestion window over time | values | done |
| 9.4 | `fig-stacks` | The protocol stack under HTTP/2 compared with the stack under HTTP/3 | still |  |

## 10. HTTP and TLS (`http-and-tls`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 10.1 | `fig-cache-flow` | How an HTTP cache decides what to do with a request | play | done |
| 10.2 | `fig-versions` | How three responses, A, B and C, travel in each HTTP version | still |  |
| 10.3 | `fig-chain` | A certificate chain | still |  |
| 10.4 | `fig-termination` | Three places to terminate TLS | still |  |

## 11. API styles: REST, GraphQL and gRPC (`api-styles`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 11.1 | `fig-pagination` | Offset pagination compared with cursor pagination when a new item arrives | play | done |
| 11.2 | `fig-graphql` | Loading one screen with REST and with GraphQL | play | done |
| 11.3 | `fig-styles` | Where each API style typically sits in one system | still |  |

## 12. Real-time communication (`realtime-communication`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 12.1 | `fig-patterns` | Four ways for a browser to receive news from a server, drawn as timelines | play | done |
| 12.2 | `fig-webrtc` | The parts of a WebRTC connection | still |  |
| 12.3 | `fig-webhook` | Receiving a webhook safely, and the provider’s retries | play | done |
| 12.4 | `fig-gateway` | A gateway tier with a publish and subscribe backplane | still |  |

## 13. Proxies, load balancers and API gateways (`proxies-and-load-balancers`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 13.1 | `fig-forward-reverse` | A forward proxy compared with a reverse proxy | still |  |
| 13.2 | `fig-l4-l7` | How a layer 4 balancer and a layer 7 balancer treat the same traffic | still |  |
| 13.3 | `fig-algorithms` | Response time under four load balancing algorithms, from a simulation | values | done |
| 13.4 | `fig-drain` | The steps of draining a server before stopping it | play | done |
| 13.5 | `fig-tiers` | Two tiers of load balancing in a large system | still |  |

## 14. CDNs and edge computing (`cdn-and-edge`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 14.1 | `fig-edge-flow` | A request served by an edge location, on a cache hit and on a miss | play | done |
| 14.2 | `fig-cache-key` | Which parts of a request form the cache key | still |  |
| 14.3 | `fig-shield` | Origin fetches with and without an origin shield | still |  |
| 14.4 | `fig-where-code-runs` | Three places code can run, and what each is close to | still |  |

## 15. Data models and choosing a database (`data-models`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 15.1 | `fig-models` | The same photo, its owner and its comments in four data models | still |  |
| 15.2 | `fig-wide-column` | Rows in a wide-column store, grouped by partition key and sorted by clustering key | still |  |
| 15.3 | `fig-row-column` | Row-oriented storage compared with column-oriented storage | still |  |
| 15.4 | `fig-choose` | A sequence of questions for choosing a data model | still |  |
| 15.5 | `fig-usage` | Databases used by developers, Stack Overflow survey 2025 | values | done |

## 16. Indexes and query execution (`indexes-and-queries`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 16.1 | `fig-btree` | A B-tree index and the table rows it points to | still |  |
| 16.2 | `fig-composite` | Which queries a composite index on owner and creation time can serve | still |  |
| 16.3 | `fig-selectivity` | The cost of an index scan and of a full scan as more rows match | still |  |

## 17. Transactions and isolation (`transactions`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 17.1 | `fig-anomalies` | A lost update and a write skew, shown as timelines of two concurrent requests | play | done |
| 17.2 | `fig-mvcc` | Two versions of a row under multi-version concurrency control, and which reader sees which | play | done |
| 17.3 | `fig-deadlock` | A deadlock between two transfers running in opposite directions | play | done |

## 18. Storage engines: B-trees and LSM trees (`storage-engines`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 18.1 | `fig-log-index` | An append-only log with an in-memory hash index | still |  |
| 18.2 | `fig-wal` | The path of a write through the buffer pool, the write-ahead log and the data files | play | done |
| 18.3 | `fig-lsm` | The structure of an LSM tree and the paths of a write and a read | play | done |
| 18.4 | `fig-compaction` | Compaction merges two sorted files and discards overwritten and deleted entries | still |  |

## 19. Schema design, normalization and migrations (`schema-design`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 19.1 | `fig-er` | The tables of the photo app and the relationships between them | still |  |
| 19.2 | `fig-normalize` | An orders table before and after normalization | still |  |
| 19.3 | `fig-expand` | Renaming a column in five compatible steps | play | done |

## 20. Replication (`replication`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 20.1 | `fig-leader-follower` | Leader and follower replication | play | done |
| 20.2 | `fig-sync-async` | Asynchronous and synchronous replication compared as message sequences | play | done |
| 20.3 | `fig-lag` | A user fails to see her own comment because of replication lag | play | done |
| 20.4 | `fig-split-brain` | Split brain: two leaders accepting writes on either side of a network fault | play | done |
| 20.5 | `fig-merkle` | Two replicas comparing Merkle trees to find the one key range that differs | still |  |

## 21. Partitioning and consistent hashing (`partitioning`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 21.1 | `fig-partition-replica` | Three partitions, each replicated across three nodes | still |  |
| 21.2 | `fig-range-hash` | Twenty usernames distributed by range partitioning and by hash partitioning | still |  |
| 21.3 | `fig-ring` | A consistent hashing ring before and after a node is added | play | done |
| 21.4 | `fig-hot` | Load per shard in a cluster with one hot shard | values | done |

## 22. Caching (`caching`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 22.1 | `fig-layers` | The caches along the path of a request | still |  |
| 22.2 | `fig-aside` | The cache-aside pattern for a read and for a write | play | done |
| 22.3 | `fig-race` | A race between a read and a write that leaves a stale value in the cache | play | done |
| 22.4 | `fig-stampede` | A cache stampede, and the same event with single flight | play | done |

## 23. Object, block and file storage (`object-and-file-storage`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 23.1 | `fig-three-kinds` | Block, file and object storage compared by interface | still |  |
| 23.2 | `fig-erasure` | Erasure coding with four data pieces and two parity pieces | still |  |
| 23.3 | `fig-overhead` | Raw storage needed to hold one terabyte of data under four redundancy schemes | values | done |
| 23.4 | `fig-presigned` | Uploading a file directly to object storage with a presigned URL | play | done |

## 24. Search systems (`search-systems`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 24.1 | `fig-inverted` | Three documents and the inverted index built from them | still |  |
| 24.2 | `fig-analysis` | An analyzer turning a phrase into index terms | play | done |
| 24.3 | `fig-scatter` | A search query fanned out to three shards and merged | play | done |
| 24.4 | `fig-sync` | A search index kept up to date from the database’s change stream | play | done |

## 25. Time-series, graph, geospatial and vector stores (`specialized-databases`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 25.1 | `fig-rollup` | Downsampling a time series into coarser tiers with longer retention | still |  |
| 25.2 | `fig-geo` | A nearby search using a grid of cells | still |  |
| 25.3 | `fig-ann` | Two approximate nearest neighbor indexes: clusters and a layered graph | still |  |

## 26. Failure models, time and clocks (`distributed-fundamentals`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 26.1 | `fig-indistinguishable` | Three failures that look the same to the client | play | done |
| 26.2 | `fig-pause` | A process pause that outlasts a lease | play | done |
| 26.3 | `fig-lww` | Clock skew causing last-write-wins to discard the later write | play | done |
| 26.4 | `fig-lamport` | Lamport clock values across three processes exchanging messages | play | done |

## 27. CAP, PACELC and consistency models (`consistency-models`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 27.1 | `fig-linearizable` | A history of three clients that violates linearizability | play | done |
| 27.2 | `fig-cap` | The choice a replica faces during a network partition | still |  |
| 27.3 | `fig-spectrum` | Four consistency models from strongest to weakest | still |  |

## 28. Consensus and leader election (`consensus`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 28.1 | `fig-states` | The three roles of a Raft server and the transitions between them | play | done |
| 28.2 | `fig-log` | The logs of five Raft servers, showing which entries are committed | still |  |
| 28.3 | `fig-partition` | A five-server Raft group split by a network partition | play | done |
| 28.4 | `fig-fencing` | A fencing token preventing a write from a stale lock holder | play | done |

## 29. Distributed transactions and sagas (`distributed-transactions`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 29.1 | `fig-dual-write` | The dual-write problem in both orders | play | done |
| 29.2 | `fig-2pc` | The message sequence of two-phase commit | play | done |
| 29.3 | `fig-saga` | A saga whose third step fails, and the compensations that follow | play | done |
| 29.4 | `fig-outbox` | The transactional outbox pattern | play | done |

## 30. Idempotency and delivery guarantees (`idempotency-and-delivery`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 30.1 | `fig-semantics` | At-most-once and at-least-once delivery, distinguished by when the consumer acknowledges | play | done |
| 30.2 | `fig-idem-key` | A retried request made safe by an idempotency key | play | done |
| 30.3 | `fig-inbox` | A consumer recording processed message IDs in the same transaction as its work | play | done |

## 31. Generating unique IDs (`unique-ids`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 31.1 | `fig-layouts` | The bit layouts of UUID version 4, UUID version 7 and a Snowflake-style ID, drawn to one scale | still |  |
| 31.2 | `fig-locality` | Where inserts land in an index with random IDs and with time-ordered IDs | still |  |

## 32. Probabilistic data structures (`probabilistic-structures`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 32.1 | `fig-bloom` | A 16-bit Bloom filter with three hash functions, after two additions and during two lookups | play | done |
| 32.2 | `fig-fill` | The false positive rate of a Bloom filter as it is filled beyond the number of items it was sized for | values | done |
| 32.3 | `fig-gate` | A Bloom filter placed in front of an expensive lookup | still |  |
| 32.4 | `fig-hll` | How HyperLogLog processes one item | play | done |
| 32.5 | `fig-merge` | Adding distinct counts from three servers compared with merging their sketches | still |  |
| 32.6 | `fig-cms` | Reading one item’s count from a count-min sketch of four rows and ten columns | still |  |

## 33. Gossip, failure detection and coordination (`membership-and-coordination`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 33.1 | `fig-three` | Three arrangements for detecting failed nodes | still |  |
| 33.2 | `fig-phi` | Suspicion level against time since the last heartbeat, for a steady network and a jittery one | values | done |
| 33.3 | `fig-spread` | How quickly news spreads by gossip through 1,000 nodes | values | done |
| 33.4 | `fig-swim` | An indirect probe in the SWIM protocol | play | done |
| 33.5 | `fig-election` | Leader election with a lease and a watch | play | done |
| 33.6 | `fig-queue` | A fair lock built from numbered keys, each waiter watching its predecessor | play | done |

## 34. Message queues and pub/sub (`message-queues`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 34.1 | `fig-sync-async` | An upload that calls three services directly, compared with one that hands a message to a broker | play | done |
| 34.2 | `fig-leveling` | A queue absorbing a ten-minute burst of messages | values | done |
| 34.3 | `fig-models` | A queue shared by competing workers, and a topic that fans out to subscribers | still |  |
| 34.4 | `fig-lifecycle` | The states of a message in a queue | play | done |
| 34.5 | `fig-groups` | Ordered delivery within a key, with different keys processed in parallel | still |  |

## 35. Event streaming and the log (`event-streaming`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 35.1 | `fig-log` | One partition of a log, with three readers at different offsets | still |  |
| 35.2 | `fig-partitions` | A producer distributing keyed records across three partitions | still |  |
| 35.3 | `fig-isr` | One partition replicated on three brokers, showing committed records and the high watermark | still |  |
| 35.4 | `fig-compaction` | A topic before and after log compaction | still |  |
| 35.5 | `fig-group` | Partition assignment in a consumer group, before and after a third consumer joins | play | done |
| 35.6 | `fig-design` | The architecture of a distributed message queue built as a partitioned, replicated log | still |  |

## 36. Event-driven architecture, event sourcing and CQRS (`event-driven-architecture`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 36.1 | `fig-styles` | A thin notification event compared with an event that carries state | still |  |
| 36.2 | `fig-es` | Handling a command in an event-sourced wallet | play | done |
| 36.3 | `fig-cqrs` | Separate write and read models connected by events | play | done |
| 36.4 | `fig-chain` | A chain of events linked by correlation and causation identifiers | play | done |

## 37. Change data capture and data pipelines (`change-data-capture`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 37.1 | `fig-dual` | Two ways a dual write leaves a database and a search index in permanent disagreement | play | done |
| 37.2 | `fig-polling` | A poller missing a row whose transaction committed after the poll | play | done |
| 37.3 | `fig-cdc` | Log-based change data capture | play | done |
| 37.4 | `fig-snapshot` | Taking an initial snapshot and then streaming from the log without a gap | play | done |
| 37.5 | `fig-pipeline` | The stages of an analytics data pipeline | still |  |

## 38. Batch and stream processing (`batch-and-stream-processing`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 38.1 | `fig-mapreduce` | Counting views per country with map, shuffle and reduce | play | done |
| 38.2 | `fig-time` | Event time against arrival time for 44 simulated events, with a watermark | values | done |
| 38.3 | `fig-windows` | Ten events grouped by tumbling, hopping and session windows | still |  |
| 38.4 | `fig-checkpoint` | A checkpoint capturing the input offset and the state of every operator | play | done |
| 38.5 | `fig-lambda-kappa` | The lambda architecture compared with the kappa architecture | still |  |

## 39. Job scheduling and workflow engines (`scheduling-and-workflows`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 39.1 | `fig-dst` | A 02:30 job on the two daylight saving changeover days in Berlin in 2026 | still |  |
| 39.2 | `fig-dcron` | A distributed scheduler: a leader inserts a unique run record, a queue carries it, and one worker executes it | play | done |
| 39.3 | `fig-job-states` | The states of a background job | play | done |
| 39.4 | `fig-wheel` | A timing wheel with twelve one-second slots | still |  |
| 39.5 | `fig-dag` | A nightly data pipeline as a graph of dependent tasks | still |  |
| 39.6 | `fig-replay` | A workflow that crashes at its fourth step and resumes on another worker by replaying its history | play | done |

## 40. Monoliths, modular monoliths and microservices (`monoliths-and-microservices`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 40.1 | `fig-shapes` | A monolith, a modular monolith and microservices compared | still |  |
| 40.2 | `fig-chain` | Five steps inside one process compared with the same five steps as five services | still |  |
| 40.3 | `fig-boundaries` | Services split by noun compared with services split by business capability | still |  |
| 40.4 | `fig-distmono` | A distributed monolith: four services chained by synchronous calls over one shared database | still |  |
| 40.5 | `fig-strangler` | The strangler fig pattern in three stages | play | done |

## 41. Service discovery and service mesh (`service-communication`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 41.1 | `fig-discovery` | Three arrangements for service discovery | still |  |
| 41.2 | `fig-k8s` | How a call to a Kubernetes Service reaches a pod | play | done |
| 41.3 | `fig-mesh` | A service mesh with sidecar proxies and a control plane | still |  |
| 41.4 | `fig-ambient` | The sidecar model compared with the ambient model of a service mesh | still |  |
| 41.5 | `fig-traffic` | North-south traffic through an API gateway and east-west traffic through a mesh | still |  |

## 42. Resilience patterns (`resilience-patterns`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 42.1 | `fig-cascade` | A slow dependency exhausting the threads of the services that call it | play | done |
| 42.2 | `fig-deadline` | Independent one-second timeouts at each layer compared with one deadline passed down | play | done |
| 42.3 | `fig-breaker` | The three states of a circuit breaker | play | done |
| 42.4 | `fig-bulkhead` | One shared pool of threads compared with a separate limit for each dependency | still |  |
| 42.5 | `fig-bucket` | The token bucket and the leaky bucket | still |  |
| 42.6 | `fig-window` | A burst across the boundary between two fixed windows | still |  |
| 42.7 | `fig-goodput` | Useful responses against arriving requests, with and without load shedding | values | done |

## 43. Serverless and functions (`serverless`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 43.1 | `fig-spectrum` | Who manages what, from virtual machines to functions | still |  |
| 43.2 | `fig-coldwarm` | A cold start compared with a warm start | play | done |
| 43.3 | `fig-ramp` | A burst of traffic outrunning the rate at which a function can scale | values | done |
| 43.4 | `fig-connections` | Function environments exhausting database connections, and a pooling proxy that prevents it | still |  |
| 43.5 | `fig-thumbs` | An event-driven thumbnail pipeline built from serverless parts | play | done |
| 43.6 | `fig-cost` | Monthly cost of a function and of an always-on server as traffic grows | values | done |
| 43.7 | `fig-prime` | The Prime Video monitoring service before and after its redesign | still |  |

## 44. Multi-tenancy (`multi-tenancy`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 44.1 | `fig-models` | The silo, pool and bridge models of multi-tenancy | still |  |
| 44.2 | `fig-context` | Tenant context resolved once and applied at every layer | play | done |
| 44.3 | `fig-fairqueue` | A single queue compared with a fair queue across tenants | still |  |
| 44.4 | `fig-placement` | A tenant directory mapping tenants to shards | still |  |
| 44.5 | `fig-cells` | A cell-based architecture with a thin router and three independent cells | still |  |
| 44.6 | `fig-shuffle` | Plain sharding compared with shuffle sharding across eight workers | still |  |

## 45. Multi-region and global systems (`multi-region`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 45.1 | `fig-rtt` | Round-trip time between pairs of cities, from distance alone | values | done |
| 45.2 | `fig-topologies` | Four multi-region topologies | still |  |
| 45.3 | `fig-quorum` | Commit latency of a three-replica consensus group, placed near and placed far | still |  |
| 45.4 | `fig-home` | Routing a request to the user’s home region | play | done |
| 45.5 | `fig-capacity` | Load on each surviving region after one region is lost | values | done |
| 45.6 | `fig-planes` | A failover that depends on control planes compared with a statically stable one | still |  |

## 46. Containers and orchestration (`containers-and-orchestration`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 46.1 | `fig-vm-container` | Virtual machines compared with containers | still |  |
| 46.2 | `fig-layers` | Two container images sharing their lower layers | still |  |
| 46.3 | `fig-cluster` | The parts of a Kubernetes cluster | still |  |
| 46.4 | `fig-reconcile` | The reconciliation loop | play | done |
| 46.5 | `fig-probes` | One pod’s life and the probes that govern each stage | play | done |
| 46.6 | `fig-resources` | Resource requests and limits for one container | still |  |
| 46.7 | `fig-shutdown` | The timeline of a graceful pod shutdown | play | done |

## 47. Deployment and release strategies (`deployment-strategies`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 47.1 | `fig-pipeline` | A delivery pipeline from commit to production | play | done |
| 47.2 | `fig-compat` | The four combinations of code version and data version during a rollout | still |  |
| 47.3 | `fig-rolling` | A rolling update of four copies, one step at a time | play | done |
| 47.4 | `fig-bluegreen` | Blue-green deployment before and after the switch | play | done |
| 47.5 | `fig-canary` | A canary release with a baseline group and automated comparison | play | done |
| 47.6 | `fig-flags` | A feature deployed on Monday and released gradually over a week | still |  |
| 47.7 | `fig-progressive` | A release applied in four waves over 24 hours with bake time between them | still |  |

## 48. Observability (`observability`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 48.1 | `fig-signals` | A metric, a log line and a trace describing the same failure | still |  |
| 48.2 | `fig-histogram` | Estimating the 99th percentile from a histogram’s buckets | values | done |
| 48.3 | `fig-trace` | A trace of one feed request as a waterfall of spans | values | done |
| 48.4 | `fig-propagation` | Trace context passed from service to service and through a queue | play | done |
| 48.5 | `fig-otelpipe` | A telemetry pipeline from services to storage, dashboards and alerts | still |  |
| 48.6 | `fig-alerts` | Causes compared with symptoms as the basis for alerts | still |  |
| 48.7 | `fig-burn` | Error budget remaining over a month at three burn rates | values | done |

## 49. Capacity planning and cost (`capacity-and-cost`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 49.1 | `fig-loadtest` | Measured latency of a small database as offered load rises | values | done |
| 49.2 | `fig-headroom` | What a fleet’s total capacity is held for | still |  |
| 49.3 | `fig-autoscale` | Demand and autoscaled capacity over one simulated day | values | done |
| 49.4 | `fig-pricing` | Covering a daily load curve with committed and on-demand capacity | values | done |
| 49.5 | `fig-bill` | The photo app’s monthly bill by line, at list prices | values | done |

## 50. Backups and disaster recovery (`disaster-recovery`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 50.1 | `fig-types` | Incremental and differential backups over one week | still |  |
| 50.2 | `fig-pitr` | Point-in-time recovery to just before a mistaken delete | play | done |
| 50.3 | `fig-rule321` | Backup copies separated by place and by authority | still |  |
| 50.4 | `fig-rto` | The parts of a recovery that takes 2 hours 22 minutes | values | done |
| 50.5 | `fig-strategies` | Four disaster recovery strategies with their recovery objectives | still |  |
| 50.6 | `fig-gitlab` | The five recovery mechanisms at GitLab.com on 31 January 2017 and what became of each | still |  |

## 51. Authentication (`authentication`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 51.1 | `fig-hash` | What a stolen users table reveals under three ways of storing passwords | still |  |
| 51.2 | `fig-session` | A server-side session from sign-in to sign-out | play | done |
| 51.3 | `fig-jwt` | The three parts of a JSON Web Token and what a verifier checks | still |  |
| 51.4 | `fig-refresh` | Refresh token rotation and what happens when a stolen token is reused | play | done |
| 51.5 | `fig-phish` | A real-time phishing attack against a one-time code and against a passkey | play | done |
| 51.6 | `fig-webauthn` | Registering a passkey and signing in with it | play | done |

## 52. OAuth, OpenID Connect and single sign-on (`oauth-and-sso`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 52.1 | `fig-oauth` | The OAuth authorization code flow with PKCE | play | done |
| 52.2 | `fig-patterns` | Three places a web application can keep its tokens | still |  |
| 52.3 | `fig-sso` | Single sign-on: one identity provider trusted by several applications | still |  |
| 52.4 | `fig-sso-flow` | Single sign-on: the first application asks Ana to sign in, the second does not | play | done |
| 52.5 | `fig-hops` | Two identities on every hop of a request | still |  |

## 53. Authorization (`authorization`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 53.1 | `fig-bola` | The same request with and without an object-level check | play | done |
| 53.2 | `fig-levels` | Three levels at which a request must be authorized | still |  |
| 53.3 | `fig-rebac` | Answering a permission check by walking relationships | play | done |
| 53.4 | `fig-enemy` | A permission check against stale data, and one that states how fresh it must be | play | done |
| 53.5 | `fig-pdp` | One decision, from the request to the log | play | done |

## 54. Cryptography in practice (`cryptography-in-practice`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 54.1 | `fig-aead` | What goes into authenticated encryption and what comes out | still |  |
| 54.2 | `fig-hybrid` | Two parties agreeing on a secret key in front of an eavesdropper | play | done |
| 54.3 | `fig-certs` | The longest lifetime allowed for a public TLS certificate, by the date the limit took effect | values | done |
| 54.4 | `fig-layers` | What each layer of encryption at rest stops | still |  |
| 54.5 | `fig-envelope` | Envelope encryption: writing and reading one photo | play | done |

## 55. Threat modeling and common attacks (`threats-and-defenses`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 55.1 | `fig-boundaries` | The photo app drawn with its trust boundaries | still |  |
| 55.2 | `fig-sqli` | The same input sent to a database inside the query text and as a parameter | play | done |
| 55.3 | `fig-xss` | A stored script running in another user’s browser | play | done |
| 55.4 | `fig-csrf` | A forged cross-site request, with and without a SameSite cookie | play | done |
| 55.5 | `fig-ssrf` | A server tricked into fetching an internal address | play | done |

## 56. Object-oriented design in TypeScript (`oop-in-typescript`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 56.1 | `fig-encapsulation` | An album with open fields and an album that guards its rule | play | done |
| 56.2 | `fig-dispatch` | One line of calling code, a different method each time | play | done |
| 56.3 | `fig-fragile` | A subclass counting each added item twice | play | done |
| 56.4 | `fig-compose` | Combining behaviors by inheritance and by composition | still |  |
| 56.5 | `fig-model` | The classes in this chapter, drawn as a class diagram | still |  |

## 57. SOLID and other design principles (`solid-principles`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 57.1 | `fig-srp` | One class answering to three groups of people, and three pieces answering to one each | still |  |
| 57.2 | `fig-ocp` | What adding a new plan touches | play | done |
| 57.3 | `fig-lsp` | A subtype that cannot keep its supertype’s promise | play | done |
| 57.4 | `fig-dip` | The direction of dependency, before and after it is inverted | still |  |
| 57.5 | `fig-demeter` | Reaching through objects, and asking the nearest one | play | done |

## 58. UML: class, sequence and state diagrams (`uml-diagrams`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 58.1 | `fig-box` | How to read a class box | still |  |
| 58.2 | `fig-relations` | The six lines of a class diagram | still |  |
| 58.3 | `fig-class` | A class diagram for uploading a photo | still |  |
| 58.4 | `fig-seqnote` | The marks used in a sequence diagram | still |  |
| 58.5 | `fig-sequence` | A sequence diagram for uploading a photo | play | done |
| 58.6 | `fig-state` | A state diagram for one upload | play | done |

## 59. Creational patterns (`creational-patterns`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 59.1 | `fig-factory` | A factory function between the caller and the classes | play | done |
| 59.2 | `fig-abstract` | An abstract factory hands out one matching family | still |  |
| 59.3 | `fig-builder` | A builder collects choices and creates the object at the end | play | done |
| 59.4 | `fig-singleton` | Two requests asking for the one connection pool at the same moment | play | done |
| 59.5 | `fig-copy` | A shallow copy and a deep copy of the same object | play | done |

## 60. Structural patterns (`structural-patterns`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 60.1 | `fig-wrappers` | Four patterns that wrap one object in another | still |  |
| 60.2 | `fig-decorator` | A call passing through two decorators | play | done |
| 60.3 | `fig-facade` | Five parts used directly, and through a facade | still |  |
| 60.4 | `fig-composite` | A folder answering a question by asking its children | play | done |
| 60.5 | `fig-flyweight` | A million photo records sharing fifty camera descriptions | still |  |

## 61. Behavioral patterns (`behavioral-patterns`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 61.1 | `fig-observer` | An album announcing a new photo to three listeners | play | done |
| 61.2 | `fig-state` | An upload holding one state object at a time | play | done |
| 61.3 | `fig-family` | Strategy and state have the same structure and different intent | still |  |
| 61.4 | `fig-command` | Undo and redo as two stacks of command objects | play | done |
| 61.5 | `fig-chain` | A request passing along a chain of handlers | play | done |

## 62. Concurrency in application code (`concurrency-in-code`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 62.1 | `fig-loop` | The event loop running a five-line program | play | done |
| 62.2 | `fig-await` | Calls in sequence, all at once, and three at a time | still |  |
| 62.3 | `fig-race` | Two uploads checking the same quota | play | done |
| 62.4 | `fig-threads` | Two threads adding one to the same counter | play | done |
| 62.5 | `fig-deadlock` | Two tasks and two locks, taken in opposite orders and in the same order | play | done |

## 63. Domain modeling (`domain-modeling`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 63.1 | `fig-aggregate` | The Order aggregate and what lies outside it | still |  |
| 63.2 | `fig-size` | One large aggregate, or several small ones | still |  |
| 63.3 | `fig-conflict` | Two requests changing the same order at once | play | done |
| 63.4 | `fig-flow` | Placing an order: one use case passing through the layers | play | done |
| 63.5 | `fig-contexts` | Three bounded contexts, each with its own model of a photo and a customer | still |  |

## 64. Layered, hexagonal and clean architecture (`application-architecture`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 64.1 | `fig-direction` | Layers that depend downward, and layers that depend inward | still |  |
| 64.2 | `fig-hexagon` | Ports and adapters around the order application | still |  |
| 64.3 | `fig-request` | One request crossing the layers and returning | play | done |
| 64.4 | `fig-imports` | Which file imports which, in the code of this chapter | still |  |
| 64.5 | `fig-packaging` | Folders by layer, and folders by feature | still |  |

## 65. Error handling and testable design (`errors-and-testing`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 65.1 | `fig-travel` | An expected error and a bug, traveling out through the layers | play | done |
| 65.2 | `fig-return` | Returning a promise from inside a try block, with and without await | play | done |
| 65.3 | `fig-seams` | Hidden dependencies, and the same logic with its dependencies passed in | still |  |
| 65.4 | `fig-doubles` | A test using a stub and a spy in place of real collaborators | play | done |
| 65.5 | `fig-pyramid` | Three levels of test, by number, speed and scope | still |  |

## 66. A method for low-level design problems (`lld-method`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 66.1 | `fig-nouns` | Sorting the words of a problem statement into a model | still |  |
| 66.2 | `fig-build` | The class diagram for the lending library, built in the order you would draw it | play | done |
| 66.3 | `fig-borrow` | Borrowing a book, and returning it late | play | done |

## 67. Parking lot (`lld-parking-lot`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 67.1 | `fig-classes` | The classes of the parking lot | still |  |
| 67.2 | `fig-fit` | Which vehicle may use which size of spot, and in what order of preference | still |  |
| 67.3 | `fig-fee` | The fee for a car by length of stay, with and without the daily cap | values | done |
| 67.4 | `fig-park` | A car entering at 09:00 and leaving at 11:30 | play | done |
| 67.5 | `fig-gates` | Two entry gates and one free spot | play | done |

## 68. Elevator system (`lld-elevator`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 68.1 | `fig-classes` | The classes of the elevator system | still |  |
| 68.2 | `fig-states` | The three states of an elevator car | play | done |
| 68.3 | `fig-look` | Floors traveled by one car serving seven requests in two different orders | values | done |
| 68.4 | `fig-shaft` | One car answering three hall calls and its own passengers | play | done |
| 68.5 | `fig-dispatch` | Average wait for a car under three dispatching strategies, measured by simulation | values | done |

## 69. Vending machine (`lld-vending-machine`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 69.1 | `fig-states` | The four states of the vending machine | play | done |
| 69.2 | `fig-classes` | The classes of the vending machine | still |  |
| 69.3 | `fig-sale` | A sale with change, and a sale that jams | play | done |
| 69.4 | `fig-money` | Where the money is at each moment of a sale | still |  |
| 69.5 | `fig-change` | Giving 30 in change from one 25 and three 10s | play | done |

## 70. LRU and LFU caches (`lld-lru-cache`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 70.1 | `fig-structure` | A hash map and a doubly linked list holding the same three entries | still |  |
| 70.2 | `fig-lru` | Seven operations on a least-recently-used cache with room for three entries | play | done |
| 70.3 | `fig-lfu` | Nine operations on a least-frequently-used cache with room for three entries | play | done |
| 70.4 | `fig-speed` | Time for one cache operation at four capacities, for four implementations | values | done |
| 70.5 | `fig-hit` | Hit ratio of three eviction policies on three kinds of traffic | values | done |

## 71. Rate limiter (`lld-rate-limiter`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 71.1 | `fig-classes` | The classes of the rate limiter | still |  |
| 71.2 | `fig-raster` | The same twenty requests, judged by each algorithm | still |  |
| 71.3 | `fig-worst` | How far above the limit each algorithm can go | values | done |
| 71.4 | `fig-composite` | Two limits at once, checked one after the other or together | play | done |
| 71.5 | `fig-race` | Two requests and one token left, with the state in a remote store | play | done |

## 72. Expense sharing (`lld-splitwise`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 72.1 | `fig-classes` | The classes of expense sharing | still |  |
| 72.2 | `fig-allocate` | Dividing 85.50 in shares of 1, 1 and 2 | play | done |
| 72.3 | `fig-balances` | Balances after each expense of a weekend away | play | done |
| 72.4 | `fig-debts` | Six debts pair by pair, or three payments from the balances | still |  |
| 72.5 | `fig-fewest` | Five balances: settling greedily in four payments, or in three | play | done |
| 72.6 | `fig-gap` | How often greedy needs more payments than the fewest | values | done |

## 73. Chess and tic-tac-toe (`lld-board-games`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 73.1 | `fig-classes` | The classes for two board games | still |  |
| 73.2 | `fig-lines` | A counter for every line: the win check after each move | play | done |
| 73.3 | `fig-legal` | Two moves the pieces allow and the rules refuse | play | done |
| 73.4 | `fig-tree` | Values coming up a game tree, and the positions alpha-beta never looks at | play | done |

## 74. Movie ticket booking (`lld-booking`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 74.1 | `fig-classes` | The classes of the booking core | still |  |
| 74.2 | `fig-states` | The states of one seat, and seat C7 over a few minutes | play | done |
| 74.3 | `fig-payment` | Payment in the middle: in time, and too late | play | done |
| 74.4 | `fig-race` | Two customers, two seats: read then write, or check and set | play | done |
| 74.5 | `fig-holdtime` | How long to hold: lost while paying, turned away, and selling out | values | done |

## 75. Logger, pub/sub and task scheduler (`lld-infrastructure`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 75.1 | `fig-classes` | Three small libraries and the parts they share | still |  |
| 75.2 | `fig-burst` | A burst of 1,000 log records into a buffer of 100 | values | done |
| 75.3 | `fig-scheduler` | One heap of entries, and one timer for the earliest | play | done |
| 75.4 | `fig-missed` | A task due every 10 seconds that cannot keep up | values | done |
| 75.5 | `fig-herd` | 1,000 retries in step, and the same retries with jitter | values | done |

## 76. A method for high-level design problems (`hld-method`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 76.1 | `fig-time` | A time plan for a 45-minute and a 60-minute round | still |  |
| 76.2 | `fig-architecture` | The pastebin’s first design | still |  |
| 76.3 | `fig-flow` | Creating a paste, and reading it after the cache has lost it | play | done |
| 76.4 | `fig-cache` | Share of reads answered by the cache, by cache size | values | done |
| 76.5 | `fig-live` | Pastes alive on each day after launch | values | done |

## 77. URL shortener (`hld-url-shortener`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 77.1 | `fig-architecture` | The design of the URL shortener | still |  |
| 77.2 | `fig-flows` | Creating a link, and following one | play | done |
| 77.3 | `fig-birthday` | How soon random codes repeat | values | done |
| 77.4 | `fig-ranges` | Counter ranges, and what a crash costs | play | done |
| 77.5 | `fig-browser` | How many of three clicks reached the shortener | values | done |
| 77.6 | `fig-hit-ratio` | Hit ratio of a cache of links, by size | values | done |

## 78. Distributed rate limiter (`hld-rate-limiter`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 78.1 | `fig-architecture` | Where the limits are checked | still |  |
| 78.2 | `fig-flow` | A request checked against the shared store, and the same request when the store is down | play | done |
| 78.3 | `fig-race` | What the race lets through | values | done |
| 78.4 | `fig-local` | Local shares refuse clients that keep to their limit | values | done |
| 78.5 | `fig-sync` | Counting locally between syncs | values | done |
| 78.6 | `fig-outage` | The counter store is down for 30 seconds | values | done |

## 79. Distributed key-value store (`hld-key-value-store`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 79.1 | `fig-architecture` | The ring, a key’s replicas, and inside one node | still |  |
| 79.2 | `fig-flows` | A write while one replica is down, and a read that repairs | play | done |
| 79.3 | `fig-spread` | How evenly a ring spreads data | values | done |
| 79.4 | `fig-partition` | Two of three replicas cut off for 30 seconds | values | done |

## 80. Object storage service (`hld-object-storage`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 80.1 | `fig-architecture` | The data path and the metadata path | still |  |
| 80.2 | `fig-flows` | Writing an object, and reading it with one node slow | play | done |
| 80.3 | `fig-racks` | Objects lost when one rack of twelve is destroyed | values | done |
| 80.4 | `fig-durability` | Durability against repair time | values | done |
| 80.5 | `fig-compaction` | Compaction: space against rewriting | values | done |

## 81. News feed (`hld-news-feed`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 81.1 | `fig-architecture` | The design of the news feed | still |  |
| 81.2 | `fig-flows` | Publishing a post, and reading the feed | play | done |
| 81.3 | `fig-who-pays` | Who pays for each follow | values | done |
| 81.4 | `fig-celebrity` | How long ordinary posts wait when a celebrity posts | values | done |
| 81.5 | `fig-funnel` | How many candidates the full model must score | values | done |

## 82. Chat system (`hld-chat`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 82.1 | `fig-architecture` | The design of the chat system | still |  |
| 82.2 | `fig-flows` | Sending a message, and recovering from a lost one | play | done |
| 82.3 | `fig-latency` | How long a message takes to reach each device | values | done |
| 82.4 | `fig-pointers` | One conversation log, and how far each device has got | still |  |
| 82.5 | `fig-receipts` | Receipts per message, one each or a watermark | values | done |

## 83. Notification system (`hld-notifications`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 83.1 | `fig-architecture` | The design of the notification system | still |  |
| 83.2 | `fig-flows` | One notification, and a retry made while unsure | play | done |
| 83.3 | `fig-dupes` | Where a notification gets sent twice | still |  |
| 83.4 | `fig-campaign` | Critical notifications behind a campaign | values | done |
| 83.5 | `fig-outage` | Calls to a provider that is down, and what was lost | values | done |

## 84. Email service (`hld-email`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 84.1 | `fig-architecture` | The design of the email service | still |  |
| 84.2 | `fig-flows` | Receiving a message, and sending one that is deferred | play | done |
| 84.3 | `fig-auth` | Six messages from “the shop”, checked | still |  |
| 84.4 | `fig-outbound` | Mail to everyone else while one domain is down | values | done |

## 85. Video streaming platform (`hld-video-streaming`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 85.1 | `fig-ladder` | One video in nine renditions, cut at the same instants | still |  |
| 85.2 | `fig-architecture` | The design of the video platform | still |  |
| 85.3 | `fig-flows` | Uploading and processing a video, and starting to watch it | play | done |
| 85.4 | `fig-abr` | One mobile viewer, two players | values | done |
| 85.5 | `fig-cdn` | How much of the delivery the caches absorb | values | done |

## 86. File storage and sync (`hld-file-sync`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 86.1 | `fig-architecture` | The parts of a file sync service | still |  |
| 86.2 | `fig-sync` | An edit on the laptop reaches the phone | play | done |
| 86.3 | `fig-boundaries` | Where the boundaries fall after inserting 100 bytes | still |  |
| 86.4 | `fig-edits` | Bytes uploaded after one edit to a 32 MiB file | values | done |
| 86.5 | `fig-conflict` | Two offline edits to one file, with a revision check and with last write wins | play | done |

## 87. Search autocomplete (`hld-search-autocomplete`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 87.1 | `fig-architecture` | The parts of an autocomplete service | still |  |
| 87.2 | `fig-typing` | Three keystrokes, a cache hit and a late answer | play | done |
| 87.3 | `fig-trie` | A trie with the best two completions stored at each node | still |  |
| 87.4 | `fig-cost` | Nodes visited per lookup, by length of the prefix | values | done |
| 87.5 | `fig-trend` | Where a sudden trend ranks, hour by hour, under four ways of counting | values | done |

## 88. Web crawler (`hld-web-crawler`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 88.1 | `fig-architecture` | The parts of a web crawler | still |  |
| 88.2 | `fig-fetch` | Fetching one page | play | done |
| 88.3 | `fig-frontier` | A frontier with a queue per host and a heap of ready times | play | done |
| 88.4 | `fig-politeness` | Pages fetched per second by number of fetchers | values | done |
| 88.5 | `fig-simhash` | SimHash distances between a page and three kinds of other page | values | done |

## 89. Nearby places and nearby friends (`hld-proximity`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 89.1 | `fig-architecture` | Two designs: nearby places and nearby friends | still |  |
| 89.2 | `fig-friends` | Ben comes online, then Ana moves | play | done |
| 89.3 | `fig-geohash` | Building a geohash by halving the world | play | done |
| 89.4 | `fig-cells` | Three ways to find the places within 2 km of a busy spot | still |  |
| 89.5 | `fig-cost` | Places examined to answer one search, by radius | values | done |

## 90. Ride hailing (`hld-ride-hailing`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 90.1 | `fig-architecture` | The parts of a ride-hailing service | still |  |
| 90.2 | `fig-request` | From request to an accepted offer | play | done |
| 90.3 | `fig-grid` | Finding the five nearest free drivers by searching rings of cells | still |  |
| 90.4 | `fig-batching` | Mean time from request to pickup, matching each rider at once or in batches | values | done |
| 90.5 | `fig-states` | The states of a trip | still |  |

## 91. Maps and navigation (`hld-maps`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 91.1 | `fig-architecture` | A maps service: tiles, directions, and live traffic | still |  |
| 91.2 | `fig-flows` | Asking for directions, then driving them | play | done |
| 91.3 | `fig-tiles` | The tile pyramid, and how a tile is named | still |  |
| 91.4 | `fig-search` | Five ways to find the same route, and the work each one does | still |  |
| 91.5 | `fig-growth` | Work for one route as the map grows | values | done |
| 91.6 | `fig-eta` | One morning: the travel time as driven, and as predicted at departure | values | done |

## 92. Real-time leaderboard (`hld-leaderboard`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 92.1 | `fig-architecture` | A leaderboard: totals in a database, ranks in a sorted set | still |  |
| 92.2 | `fig-flows` | A match ends, then Ana opens the leaderboard | play | done |
| 92.3 | `fig-sql` | A rank by counting rows, against a sorted set | values | done |
| 92.4 | `fig-skiplist` | Finding Ana’s rank in a skip list with spans | play | done |
| 92.5 | `fig-shards` | Players in each of eight shards split by score range | values | done |

## 93. Reservations: hotel rooms and high-demand tickets (`hld-ticket-booking`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 93.1 | `fig-architecture` | Reservations: searching, holding, paying | still |  |
| 93.2 | `fig-flows` | Booking three nights, and buying in a big sale | play | done |
| 93.3 | `fig-overbook` | Overbooking 100 rooms when 92% of guests arrive | values | done |
| 93.4 | `fig-hotrow` | One hot row, or the same tickets split over several | values | done |
| 93.5 | `fig-onsale` | Tickets that reached a buyer, in the first four minutes of a sale | values | done |

## 94. Payment system (`hld-payments`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 94.1 | `fig-architecture` | A payment system: money in, the ledger, money out, and the check | still |  |
| 94.2 | `fig-flows` | Paying for an order, and a lost answer | play | done |
| 94.3 | `fig-retries` | Orders charged more than once, per 100,000 payments | values | done |
| 94.4 | `fig-ledger` | One order’s money, entry by entry | play | done |
| 94.5 | `fig-reconcile` | Reconciling one day against the provider’s file | still |  |

## 95. Digital wallet (`hld-digital-wallet`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 95.1 | `fig-architecture` | A wallet as partitioned, replicated logs of events | still |  |
| 95.2 | `fig-flows` | A transfer inside one partition, and reading a balance | play | done |
| 95.3 | `fig-crash` | A crash in the middle of a transfer, with and without a record of it | play | done |
| 95.4 | `fig-replay` | Balances are a fold over the log, from the start or from a snapshot | play | done |
| 95.5 | `fig-batching` | Making events durable: one fsync per event, or one per batch | values | done |

## 96. Stock exchange (`hld-stock-exchange`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 96.1 | `fig-architecture` | A stock exchange: one sequenced stream through the matching engine | still |  |
| 96.2 | `fig-order-path` | The path of one order, from a broker to the market data feed | play | done |
| 96.3 | `fig-matching` | A buy order crossing the book, by price and then by time | play | done |
| 96.4 | `fig-divergence` | Two replicas without a sequencer: how often they disagree | values | done |
| 96.5 | `fig-feed` | A lost packet on the market data feed, found and repaired | play | done |
| 96.6 | `fig-budget` | Where a microsecond goes | values | done |

## 97. Ad click aggregation (`hld-ad-click-aggregation`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 97.1 | `fig-architecture` | Ad click aggregation: a fast streaming path and an exact batch path | still |  |
| 97.2 | `fig-click-path` | One click, from the user to a count in the results store | play | done |
| 97.3 | `fig-windows` | A watermark closing a window, a repeated click and a late one | play | done |
| 97.4 | `fig-watermark` | How long to wait before reporting, and how many clicks miss their window | values | done |
| 97.5 | `fig-crashes` | Twenty crashes, three orders of the same steps | values | done |
| 97.6 | `fig-hot` | One popular ad loads one partition | values | done |

## 98. Metrics, monitoring and logging platform (`hld-metrics-and-logging`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 98.1 | `fig-architecture` | A metrics platform: collectors, ingesters, object storage, queriers and alerts | still |  |
| 98.2 | `fig-write-path` | One scrape, from a service to a block in object storage | play | done |
| 98.3 | `fig-gorilla` | Compressing five samples of a request counter | play | done |
| 98.4 | `fig-percentiles` | The 99th percentile of each minute, and of the hour | values | done |
| 98.5 | `fig-alerts` | Four alert rules on the same noisy day | values | done |
| 98.6 | `fig-logs` | What it costs to find a log line | values | done |

## 99. Collaborative editor (`hld-collaborative-editing`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 99.1 | `fig-architecture` | A collaborative editor: one server per document, an operation log, and presence on the side | still |  |
| 99.2 | `fig-edit-path` | Two concurrent edits, ordered and transformed by the server | play | done |
| 99.3 | `fig-ot-cost` | Server transformations for each operation, by network delay | values | done |
| 99.4 | `fig-crdt` | A sequence CRDT: characters with ids, inserts after ids, deletes as tombstones | play | done |
| 99.5 | `fig-metadata` | What a CRDT keeps for each character shown | values | done |

## 100. Architecture of LLM applications (`llm-application-architecture`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 100.1 | `fig-architecture` | The parts of an application built around a language model | still |  |
| 100.2 | `fig-phases` | One request: prefill, then one decode step for each token | play | done |
| 100.3 | `fig-batching` | Eight requests on a server with four slots: static and continuous batching | still |  |
| 100.4 | `fig-load` | Tokens delivered as offered load rises, static and continuous batching | values | done |
| 100.5 | `fig-stream` | Streaming an answer: a dropped connection, a resume, and a stop | play | done |
| 100.6 | `fig-prefix` | Three layouts of the same prompt, and how much of it the prefix cache can reuse | still |  |

## 101. Retrieval and vector search (`retrieval-and-vector-search`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 101.1 | `fig-rag` | Retrieval-augmented generation: an indexing path and a question path | still |  |
| 101.2 | `fig-hnsw` | Searching a small HNSW graph, from the top layer down | play | done |
| 101.3 | `fig-tradeoff` | Recall against work: IVF and HNSW on 10,000 vectors | values | done |
| 101.4 | `fig-chunking` | Three ways to cut one help article, and where the answer falls | still |  |
| 101.5 | `fig-stages` | Two stages: cheap search over everything, an expensive model over a few | still |  |

## 102. Agents and tool use (`agent-systems`)

| No. | Id | What it shows | Kind | Status |
|---|---|---|---|---|
| 102.1 | `fig-loop` | The agent loop: the model proposes, the application acts | play | done |
| 102.2 | `fig-checkpoint` | A crash after an action, and the resume, with and without an idempotency key | play | done |
| 102.3 | `fig-guardrails` | What stands between a proposed tool call and its effect | still |  |
| 102.4 | `fig-patterns` | Four ways to arrange model calls, from fixed code to a model in control | still |  |
| 102.5 | `fig-passk` | Passing once in k tries, and passing every time in k tries | values | done |
