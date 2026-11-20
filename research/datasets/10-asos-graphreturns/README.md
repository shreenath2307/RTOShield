# 10 - ASOS GraphReturns (fashion return prediction)

- Source: paper https://arxiv.org/abs/2302.14096 (McGowan et al., FashionXRecSys 2022). Direct dataset URL NOT verified (guessed GitHub path 404'd); find the link in the paper. Status: NOT downloaded.
- Content: purchases and returns Sep-Nov 2021, ~770k customers, ~410k product variants; graph of customer-product edges with return label. Paper benchmark F1 0.792 (GNN). License unverified.
- Mapping: customer_id, product variant, return flag; a customer-behaviour return label, but post-delivery returns, not RTO. Likely no payment/pincode.
- Relevance: 2/5. Limitations: UK fashion, anonymised, not RTO.
