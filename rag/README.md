### Create the `some_vector_cache` dir for our Vector Search

#### Steps
1. generate the `job_postings.csv` if needed, this can be recreated from `notebooks/explore.ipynb`
2. create the vector store cache via `generate-index.ts`, see `pnpm reindex-vector-cache:expensive`
3. test by using `load-vector-store.ts`