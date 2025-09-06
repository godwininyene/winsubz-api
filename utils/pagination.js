const generatePaginationMeta = (req, page, limit, count)=>{
    const totalPages = Math.ceil(count /limit);
    const nextPage = page < totalPages ? page + 1: null
    const prevPage = page > 1 ? page - 1 : null
    const pagination={
        totalItems:count,
        currentPage:page,
        totalPages,
        perPage:limit,
        nextPage,
        prevPage
    }

    return pagination;
}

module.exports = generatePaginationMeta;