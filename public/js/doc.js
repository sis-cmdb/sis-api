$(function() {
    var toc = $("#table-of-contents");
    if (toc) {
        // apply it
        var ul = toc.next('ul');
        ul.addClass('nav');
        ul.addClass('nav-stacked');

        var div = $('<div class="col-md-3">');
        div.append(ul);
        toc.remove();

        var root = $("#_root_div_");
        root.addClass("col-md-9")

        var newroot = $("<div class='container'>");
        var row = $("<div class='row'>");
        newroot.append(row)
        row.append(div);
        row.append(root);

        root.find('table').addClass('table');

        $("body").append(newroot);
    }
});